// DEPENDS ON: picturesque-config.js
// DEPENDS ON: picturesque-api.js
// DEPENDS ON: picturesque-offline.js
// DEPENDS ON: picturesque-utils.js

'use strict';

/** Namespace for application */
var PicturesqueApp = PicturesqueApp || {};


/**
 * Placing this module within the application.
 *
 * Should only be defined here.
 */
PicturesqueApp.data = {};


/**
 * Log to hold status messages from data library.
 * @type {Array.Object}
 */
PicturesqueApp.data.log = [];


/**
 * Boolean indicating whether the current user has joined picturesque.
 * @type {boolean}
 */
PicturesqueApp.data.joinedPicturesque = false;


/**
 * Queue for queueing joinedPicturesque callback tasks. We use a Queue
 * instead of a list of callbacks (as is done in offline for the onOnline
 * callbacks) because the actions should be done once and forgotten.
 * @type {Queue}
 */
PicturesqueApp.data.JOIN_PICTURESQUE_QUEUE = new PicturesqueApp.utils.Queue();


/**
 * List of callbacks for joinPicturesque success event.
 * @type {Array.Function}
 */
PicturesqueApp.data.joinPicturesqueCallbacks = [];


/**
 * The joinPicturesque callback based on the list of registered callbacks.
 * It will call each of the callbacks asynchronously via setTimeout.
 */
PicturesqueApp.data.joinPicturesqueCallback = function() {
  PicturesqueApp.data.JOIN_PICTURESQUE_QUEUE.consume();
};


/**
 * Creates a Picturesque account, simply verifies the scopes. After success, calls
 * out to list of joinPicturesqueCallbacks.
 */
PicturesqueApp.data.joinPicturesque = function() {
  if (PicturesqueApp.data.joinedPicturesque) {
    PicturesqueApp.data.joinPicturesqueCallback();
    return;
  }

  var apiSuccessCallback = function(apiResponse) {
    // error_message is due to a quirk in dev_appserver
    if (apiResponse.code || apiResponse.error_message) {
      // TODO(dhermes): Add a callback for generic errors.
      PicturesqueApp.data.log.push(['joinPicturesque failed:', apiResponse]);
    } else {
      PicturesqueApp.data.joinedPicturesque = true;
      PicturesqueApp.data.joinPicturesqueCallback();
    }
  }

  if (navigator.onLine) {
    PicturesqueApp.api.callPicturesqueAPI(
        'users', 'join', {}, apiSuccessCallback);
  } else {
    var task = new PicturesqueApp.utils.CallbackTask(
        PicturesqueApp.api.callPicturesqueAPI,
        'users', 'join', {}, apiSuccessCallback);
    PicturesqueApp.offline.addTaskToQueue(task);
  }
};


/**
 * Constructor for a DataStore instance. Passes along args to ImageStore.
 *
 * @param {object} args Optional object literal with the following
 *     properties.
 *     saveSuccessCallback {Function} The method to be called when a picture
 *         is saved sucessfully. Default is a function which does nothing.
 *         The photo metadata will be passed in to this method.
 *     saveFailureCallback {Function} The method to be called when a picture
 *         is not saved sucessfully. Default is a function which does nothing.
 *         No arguments will be passed to this callback.
 *     getPhotoCallback {Function} The method to be called when a picture is
 *         retrieved. Default is the saveSuccessCallback. The photo metadata
 *         will be passed in to this method.
 *     getPhotosCompletionCallback {Function} The method to be called when the
 *         getPhotos has reached completion. No arguments will be passed to
 *         this callback.
 *     renameCallback {Function} The method to be called when a picture
 *         is renamed after getting a proper key from the server. Default is a
 *         function which does nothing. The previous key and the current photo
 *         metadata will be passed in to this method (in that order).
 *     base64PropertyName {string} The name of the property on image payloads
 *         which holds the base64 photo contents. Default is set in
 *         PicturesqueApp.config as BASE64_PROPERTY_NAME.
 *     mimeTypePropertyName {string} The name of the property on image payloads
 *         which holds the photo MIME type. Default is set in
 *         PicturesqueApp.config as MIMETYPE_PROPERTY_NAME.
 *     localUriPropertyName {string} The name of the property to be set on
 *         image payloads which holds a link to the URI of the local file.
 *         Default is set in PicturesqueApp.config as LOCAL_URI_PROPERTY_NAME.
 *     updatedPropertyName {string} The name of the property on image payloads
 *         which holds the time when the item was updated. Default is set in
 *         PicturesqueApp.config as UPDATED_PROPERTY_NAME.
 *     titlePropertyName {string} The name of the property on image payloads
 *         which holds the photo title. Default is set in PicturesqueApp.config
 *         as TITLE_PROPERTY_NAME.
 *     descriptionPropertyName {string} The name of the property on image
 *         payloads which holds the photo description. Default is set in
 *         PicturesqueApp.config as DESCRIPTION_PROPERTY_NAME.
 *     tagsPropertyName {string} The name of the property on image payloads
 *         which holds the photo tags. Default is set in PicturesqueApp.config
 *         as TAGS_PROPERTY_NAME.
 */
PicturesqueApp.data.DataStore = function(args) {
  this.imageStore = new PicturesqueApp.offline.ImageStore(args);
  this.titlePropertyName = args.titlePropertyName ||
                           PicturesqueApp.config.TITLE_PROPERTY_NAME;
  this.descriptionPropertyName =
      args.descriptionPropertyName ||
      PicturesqueApp.config.DESCRIPTION_PROPERTY_NAME;
  this.tagsPropertyName = args.tagsPropertyName ||
                          PicturesqueApp.config.TAGS_PROPERTY_NAME;

  // Retrieveal progress indicator flags
  this.getLocalComplete = false;
  this.getLocalInProgress = false;
  this.getRemoteInProgress = false;
  this.gotFirstPhoto = false;

  // Callbacks
  // TODO(dhermes): Add rename failure callback.
  var defaultCallback = function() {};

  this.renameCallback = args.renameCallback || defaultCallback;
  this.getPhotoCallback = args.getPhotoCallback ||
                          this.imageStore.saveSuccessCallback;
  this.getPhotosCompletionCallback = args.getPhotosCompletionCallback ||
                                     defaultCallback;

  // Override save success to also fire a network call if the photo
  // is successfully saved locally.
  var currentDataStore = this;
  var originalSaveCallback = this.imageStore.saveSuccessCallback;
  var customSaveSuccessCallback = function(photoMetadata) {
    if (photoMetadata.localOnly) {
      currentDataStore.createPhoto(photoMetadata);
    }

    originalSaveCallback(photoMetadata);
  };
  this.imageStore.saveSuccessCallback = customSaveSuccessCallback;

  PicturesqueApp.data.log.push(['DataStore created with:', args]);
};


//
// ApiCallbackTask class definition and prototype
//

/**
 * Constructor for an ApiCallbackTask instance. A simple subclass of
 * CallbackTask which is also aware of the network and the signed in
 * in status of the current user.
 */
PicturesqueApp.data.ApiCallbackTask = function() {
  PicturesqueApp.utils.CallbackTask.apply(this, arguments);
};


/**
 * Set the parent class.
 */
PicturesqueApp.data.ApiCallbackTask.prototype =
    new PicturesqueApp.utils.CallbackTask();
PicturesqueApp.data.ApiCallbackTask.prototype.constructor =
    PicturesqueApp.data.ApiCallbackTask;


/**
 * Applies the callback to the stored arguments, depending on the signed in
 * and network statuses.
 */
PicturesqueApp.data.ApiCallbackTask.prototype.callTask = function() {
  // Order is important here.
  if (!PicturesqueApp.data.joinedPicturesque) {
    PicturesqueApp.data.JOIN_PICTURESQUE_QUEUE.tasks.push(this);
  } else if (navigator.onLine) {
    PicturesqueApp.utils.CallbackTask.prototype.callTask.call(this);
  } else {
    PicturesqueApp.offline.addTaskToQueue(this);
  }
};


/**
 * Adds a photo, parceling out work to the various places modules that save
 * photos. In the DataStore constructor, saveSuccessCallback will spawn the
 * network task needed as well.
 *
 * @param {string} title The title of the photo.
 * @param {string} base64Photo The base64 contents of the photo.
 * @param {string} mimeType The MIME type of the photo.
 * @param {string} description The (optional) description of the photo.
 */
PicturesqueApp.data.DataStore.prototype.addPhoto =
    function(title, base64Photo, mimeType, description) {
  var photoMetadata = {};
  photoMetadata[this.titlePropertyName] = title;
  photoMetadata[this.imageStore.base64PropertyName] = base64Photo;
  photoMetadata[this.imageStore.mimeTypePropertyName] = mimeType;
  if (description) {
    photoMetadata[this.descriptionPropertyName] = description;
  }

  // Save uses the overridden saveSuccessCallback from the DataStore
  // constructor.
  this.imageStore.save(photoMetadata);
};


/**
 * Creates task to send a 'create' request to the API, depending on the signed
 * in status and the network status. We expect the photoMetadata corresponds to
 * a photo which has already been saved locally, hence will have a key and
 * potentially some other values set that don't belong in the 'create' request.
 *
 * @param {Object} photoMetadata An object containing photo contents.
 */
PicturesqueApp.data.DataStore.prototype.createPhoto = function(photoMetadata) {
  var apiPayload = {};
  apiPayload[this.titlePropertyName] = photoMetadata[this.titlePropertyName];
  apiPayload[this.imageStore.base64PropertyName] =
      photoMetadata[this.imageStore.base64PropertyName];
  apiPayload[this.imageStore.mimeTypePropertyName] =
      photoMetadata[this.imageStore.mimeTypePropertyName];

  if (photoMetadata[this.descriptionPropertyName]) {
    apiPayload[this.descriptionPropertyName] =
        photoMetadata[this.descriptionPropertyName];
  }

  // Need to wrap this.createCallback in anonymous fn. so it can be passed
  // to other methods as a callback. Also need to wrap the temporary local
  // storage key via closure.
  var currentDataStore = this;
  var anonymousCreateCallback = function(apiResponse) {
    return currentDataStore.createCallback(apiResponse, photoMetadata);
  };

  var task = new PicturesqueApp.data.ApiCallbackTask(
      PicturesqueApp.api.callPicturesqueAPI, 'photo', 'create',
      apiPayload, anonymousCreateCallback);

  // Need to wrap task.callTask in anonymous fn. so it can be passed to
  // setTimeout.
  var anonymousCallTask = function() {
    task.callTask();
  };

  // Asynchronously call the task and let ApiCallbackTask and the offline and
  // joinPicturesque queues do the work.
  setTimeout(anonymousCallTask, 0);
};


/**
 * Callback for the API 'create' method. Uses the imageStore to rename the
 * locally saved content and trigger the rename callback.
 *
 * @param {Object} apiResponse The response from the 'create' API call holding
 *                             the inserted photo metadata.
 * @param {Object} storedMetadata The currently stored contents to be renamed.
 */
PicturesqueApp.data.DataStore.prototype.createCallback =
    function(apiResponse, storedMetadata) {
  // error_message is due to a quirk in dev_appserver
  if (apiResponse.code || apiResponse.error_message) {
    // TODO(dhermes): Perform clean-up when the API response fails.
    PicturesqueApp.data.log.push(['photo.create request failed:',
                                  apiResponse]);
    return;
  }
  // TODO(dhermes): Actually do the renaming.
  var previousKey = storedMetadata.key;
  storedMetadata.key = apiResponse.key;
  storedMetadata.localOnly = false;

  delete storedMetadata[this.imageStore.base64PropertyName];
  storedMetadata[this.imageStore.updatedPropertyName] =
      apiResponse[this.imageStore.updatedPropertyName];
  if (apiResponse[this.tagsPropertyName]) {
    storedMetadata[this.tagsPropertyName] = apiResponse[this.tagsPropertyName];
  }

  this.rename(previousKey, storedMetadata);
};


/**
 * Method to rename both the file stored in the local filesystem and the
 * item stored in local storage. After success will call the rename callback.
 *
 * @param {string} previousKey The key previously used to store the contents.
 * @param {Object} storedMetadata The new photo metadata to be renamed.
 */
PicturesqueApp.data.DataStore.prototype.rename =
    function(previousKey, storedMetadata) {
  var filesystemRenameFailureCallback = function(error) {
    // TODO(dhermes): Perform clean-up when the API response fails.
    PicturesqueApp.data.log.push(['filesystem rename failed:', error]);
  };

  var currentDataStore = this;

  var filesystemRenameSuccessCallback = function(fileEntry) {
    // localStorageRenameSuccessCallback defined below
    storedMetadata[currentDataStore.imageStore.localUriPropertyName] =
        fileEntry.toURL();
    PicturesqueApp.offline.db.save(storedMetadata,
                                   localStorageRenameSuccessCallback);
  };

  PicturesqueApp.offline.filer.mv(previousKey, '.', storedMetadata.key,
                                  filesystemRenameSuccessCallback,
                                  filesystemRenameFailureCallback);

  var localStorageRenameSuccessCallback = function() {
    // Only delete after the new one has saved successfully.
    PicturesqueApp.offline.db.remove(previousKey);
    currentDataStore.renameCallback(previousKey, storedMetadata);
  }
};


/**
 * Get list of photos; both those locally stored and those retrieved from
 * the API. Applies the saveSuccessCallback to each.
 */
PicturesqueApp.data.DataStore.prototype.getPhotos = function() {
  var currentDataStore = this;

  var getRemoteCallback = function() {
    // Since the lastUpdated get is async, we need a callback which will
    // handle the result.
    var applyLastUpdatedCallback = function(record) {
      // This will cause no value to be set in the API request if no record.
      var lastUpdated;
      if (record) {
        lastUpdated = record[PicturesqueApp.offline.LAST_UPDATED_KEY];
      }

      // The default values (undefined) will cause no value to be set in the
      // API request.
      var pageToken, limit;
      if (currentDataStore.gotFirstPhoto) {
        limit = 1;
      }

      currentDataStore.getRemotePhotos(
          currentDataStore.getPhotosCompletionCallback, lastUpdated,
          pageToken, limit);
    };

    PicturesqueApp.offline.applyLastUpdated(applyLastUpdatedCallback);
  };

  // The actual action to be taken will be async.
  var getPhotosAction = getRemoteCallback;

  if (!this.getLocalComplete) {
    // Need to wrap call in anonymous fn. so it can be passed to setTimeout.
    getPhotosAction = function() {
      currentDataStore.getLocalPhotos(getRemoteCallback);
    };
  }

  setTimeout(getPhotosAction, 0);
};


/**
 * Get list of locally stored photos. Applies the getPhotoCallback to each.
 * @param {Function} completionCallback A function which takes no arguments
 *                                      and is called after all photos have
 *                                      been retrieved.
 */
PicturesqueApp.data.DataStore.prototype.getLocalPhotos =
    function(completionCallback) {
  if (this.getLocalInProgress) {
    PicturesqueApp.data.log.push('getLocalPhotos called while in progress');
    return;
  }

  this.getLocalInProgress = true;

  var currentDataStore = this;
  PicturesqueApp.offline.db.all(function(resultsArray) {
    var totalResults = resultsArray.length;

    // If nothing stored, move immediately to the completionCallback.
    if (totalResults === 0) {
      currentDataStore.getLocalComplete = true;
      currentDataStore.getLocalInProgress = false;
      completionCallback();
      return;
    }

    var eachPhotoCallback = function(photoMetadata) {
      var result = currentDataStore.getPhotoCallback(photoMetadata);
      if (--totalResults === 0) {
        // TODO(dhermes): Replace this with a cursor in the Lawnchair
        //                result set.
        currentDataStore.getLocalComplete = true;
        currentDataStore.getLocalInProgress = false;

        // Upon completion, call the passed in completionCallback.
        completionCallback();
      }
      return result;
    };

    resultsArray.forEach(eachPhotoCallback);
  });
};


/**
 * Get list of remotely stored photos. Applies the getPhotoCallback to each.
 * @param {Function} completionCallback A function which takes no arguments
 *                                      and is called after all photos have
 *                                      been retrieved.
 * @param {string} lastUpdated Timestamp of when the local contents were last
 *                             updated.
 * @param {string} pageToken Optional token to be used in paging.
 * @param {integer} limit Optional limit on number of results to retrieve.
 */
PicturesqueApp.data.DataStore.prototype.getRemotePhotos =
    function(completionCallback, lastUpdated, pageToken, limit) {
  PicturesqueApp.data.log.push(
      ['getRemotePhotos called with:', completionCallback,
       lastUpdated, pageToken, limit]);

  if (!this.getLocalComplete) {
    PicturesqueApp.data.log.push(
        'getRemotePhotos called before getLocalComplete');
    return;
  }

  if (this.getRemoteInProgress) {
    PicturesqueApp.data.log.push(
        'getRemotePhotos called while getRemoteInProgress');
    return;
  }

  this.getRemoteInProgress = false;
  var apiPayload = {};
  apiPayload[PicturesqueApp.config.LAST_UPDATED_PROPERTY_NAME] = lastUpdated;
  if (pageToken) {
    // TODO(dhermes): Should we add these properties to the config?
    apiPayload.pageToken = pageToken;
  }
  if (limit) {
    // TODO(dhermes): Should we add these properties to the config?
    apiPayload.limit = limit;
  }

  var currentDataStore = this;
  var listPhotoCallback = function(apiResponse) {
    // error_message is due to a quirk in dev_appserver
    if (apiResponse.code || apiResponse.error_message) {
      // TODO(dhermes): Perform clean-up when the API response fails.
      PicturesqueApp.data.log.push(['photo.list request failed:',
                                    apiResponse]);
      return;
    }
    currentDataStore.gotFirstPhoto = true;

    // In case of empty result
    apiResponse.items = apiResponse.items || [];

    var photoMetadata, newLastUpdated;
    for (var photoIndex in apiResponse.items) {
      photoMetadata = apiResponse.items[photoIndex];
      newLastUpdated =
          photoMetadata[PicturesqueApp.config.UPDATED_PROPERTY_NAME];
      currentDataStore.imageStore.save(photoMetadata);
    }

    if (apiResponse.nextPageToken) {
      var continuePaging = function() {
        currentDataStore.getRemoteInProgress = false;
        // The page token is based on a query starting with lastUpdated, so we
        // don't use our new value `newLastUpdated`, as that would invalidate
        // the query and token combination.
        currentDataStore.getRemotePhotos(completionCallback, lastUpdated,
                                         apiResponse.nextPageToken);
      };
      // This somewhat relies on server side behavior. Sending newLastUpdated
      // as null/undefined would be bad, but we (safely) assume items will be
      // non-empty whenever there is a nextPageToken.
      PicturesqueApp.offline.setLastUpdated(newLastUpdated, continuePaging);
    } else {
      var completeAndRemoveInProgress = function() {
        currentDataStore.getRemoteInProgress = false;
        completionCallback();
      };
      PicturesqueApp.offline.setLastUpdated(null, completeAndRemoveInProgress);
    }
  };

  var task = new PicturesqueApp.data.ApiCallbackTask(
      PicturesqueApp.api.callPicturesqueAPI, 'photo', 'list',
      apiPayload, listPhotoCallback);

  // Don't need to make this asynchronous since it should always be called by
  // getPhotos, which is already asynchronous.
  task.callTask();
};
