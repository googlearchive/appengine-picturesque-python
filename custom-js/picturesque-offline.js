// DEPENDS ON: picturesque-config.js
// DEPENDS ON: picturesque-utils.js
// DEPENDS ON: Filer
// DEPENDS ON: Lawnchair

'use strict';

/** Namespace for application */
var PicturesqueApp = PicturesqueApp || {};


/**
 * Placing this module within the application.
 *
 * Should only be defined here.
 */
PicturesqueApp.offline = {};


/**
 * Log to hold status messages from offline library.
 * @type {Array.Object}
 */
PicturesqueApp.offline.log = [];


/**
 * DB interface for storing data offline with Lawnchair.js.
 * @type {Lawnchair}
 */
PicturesqueApp.offline.db = new Lawnchair({name: 'PicturesqueApp.db'},
  function() {
    PicturesqueApp.offline.log.push('Lawnchair db created.');
  }
);


/**
 * Filer object for working with the HTML5 filesystem.
 * @type {Filer}
 */
PicturesqueApp.offline.filer = new Filer();


/**
 * Initialize current filesystem object (filer).
 */
PicturesqueApp.offline.filer.init({persistent: false, size: 1024 * 1024},
  function(fileSystem) {
    // TODO(dhermes): Don't allow write until loaded. Initialization is very
    //                fast, so this isn't a serious issue.
    PicturesqueApp.offline.log.push(fileSystem);
  }, function() {});  // TODO(dhermes): Do something on error.


/**
 * DB Key for the lastUpdated timestamp which will be stored to keep track
 * of how fresh the data stored offline is.
 * @type {string}
 */
PicturesqueApp.offline.LAST_UPDATED_KEY =
    PicturesqueApp.config.LAST_UPDATED_PROPERTY_NAME;


//
// Helper methods to interact with lastUpdated value
//

/**
 * Sets the lastUpdated value in a special Lawnchair index just for this value.
 * This is to avoid polluting the index for Picturesque images.
 * @param {string} lastUpdated Timestamp when last called. If no value passed in.
 *                             the current UTC time is used.
 * @param {Function} callback  Function to be called when the new value is saved.
 */
PicturesqueApp.offline.setLastUpdated = function(lastUpdated, callback) {
  // Server expects ISO timestamp without trailing Z.
  lastUpdated = lastUpdated || (new Date()).toISOString().replace(/Z/, '');
  callback = callback || function() {};

  new Lawnchair({name: 'PicturesqueApp.lastUpdated'}, function() {
    // Remove it first to keep the index from blowing up in size.
    this.remove(PicturesqueApp.offline.LAST_UPDATED_KEY);

    var payload = {'key': PicturesqueApp.offline.LAST_UPDATED_KEY};
    payload[PicturesqueApp.offline.LAST_UPDATED_KEY] = lastUpdated;
    this.save(payload, callback);
  });
};


/**
 * Retrieves the lastUpdated value from offline storage and passes the record
 * returned to a callback (for async processing).
 * @param {Function} callback A function which expects the record retrieved
 *                            (or no value at all).
 */
PicturesqueApp.offline.applyLastUpdated = function(callback) {
  new Lawnchair({name: 'PicturesqueApp.lastUpdated'}, function() {
    this.get(PicturesqueApp.offline.LAST_UPDATED_KEY, function(record) {
      callback(record);
    });
  });
};


//
// ImageStore class definition and prototype
//

/**
 * Constructor for an ImageStore instance.
 *
 * @param {object} args Optional object literal with the following
 *     properties.
 *     saveSuccessCallback {Function} The method to be called when a picture
 *         is saved sucessfully. Default is a function which does nothing.
 *         The photo metadata will be passed in to this method.
 *     saveFailureCallback {Function} The method to be called when a picture
 *         is not saved sucessfully. Default is a function which does nothing.
 *         No arguments will be passed to this callback.
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
 */
PicturesqueApp.offline.ImageStore = function(args) {
  args = args || {};

  var defaultCallback = function() {};

  // Callbacks for Lawnchair db save/write.
  this.saveSuccessCallback = args.saveSuccessCallback || defaultCallback;
  this.saveFailureCallback = args.saveFailureCallback || defaultCallback;

  // Local constants for converting a raw photo to the stored version.
  this.base64PropertyName = args.base64PropertyName ||
                            PicturesqueApp.config.BASE64_PROPERTY_NAME;
  this.mimeTypePropertyName = args.mimeTypePropertyName ||
                              PicturesqueApp.config.MIMETYPE_PROPERTY_NAME;
  this.localUriPropertyName = args.localUriPropertyName ||
                              PicturesqueApp.config.LOCAL_URI_PROPERTY_NAME;
  this.updatedPropertyName = args.updatedPropertyName ||
                             PicturesqueApp.config.UPDATED_PROPERTY_NAME;

  PicturesqueApp.offline.log.push(['ImageStore created with:', args]);
};


/**
 * Asynchronously writes the base64 image contents of an API response to the
 * HTML5 filesystem and then save the remaining information with Lawnchair.
 *
 * Only conditionally saves using Lawnchair if the local filesystem write
 * succeeds.
 * @param {Object} photoMetadata An object containing photo contents,
 *                               potentially from an API response.
 */
PicturesqueApp.offline.ImageStore.prototype.save = function(photoMetadata) {
  var image = new PicturesqueApp.offline.Image(this, photoMetadata);

  var base64Value = photoMetadata[this.base64PropertyName];
  var mimeType = photoMetadata[this.mimeTypePropertyName];
  var imageBlob = PicturesqueApp.utils.base64ToBlob(base64Value, mimeType);
  var filePayload = {'data': imageBlob, 'type': mimeType};

  // Need to wrap image.localFilesystemCallback so the Image remains the
  // declared value of `this` after the callback.
  var safeLocalFilesystemCallback = function(fileEntry, fileWriter) {
    return image.localFilesystemCallback(fileEntry, fileWriter);
  };

  // Set a temporary key to be used until item is inserted.
  if (photoMetadata.key) {
    photoMetadata.localOnly = false;
  } else {
    photoMetadata.key = PicturesqueApp.utils.temporaryHash();
    photoMetadata.localOnly = true;
  }

  var maybeWrite = function() {
    PicturesqueApp.offline.filer.write(
        photoMetadata.key, filePayload, safeLocalFilesystemCallback,
        this.saveFailureCallback);
    // TODO(dhermes): Find a way to use failure callbacks with Lawnchair.
  };

  // Use setTimeout to make the save asynchronous.
  setTimeout(maybeWrite, 0);
};


//
// Image class definition and prototype
//

/**
 * Constructor for an Image instance.
 *
 * @param {ImageStore} store The parent image store which holds configuration
 *     for the current Image object.
 * @param {Object} photoMetadata An object containing photo contents,
 *                               potentially from an API response.
 */
PicturesqueApp.offline.Image = function(store, photoMetadata) {
  this.store = store;
  this.photoMetadata = photoMetadata;
  PicturesqueApp.offline.log.push(['Image created with:', store,
                                   photoMetadata]);
};


/**
 * Success callback for the image. Uses the success callback for the ImageStore
 * parent and the photoMetadata value for the current Image.
 *
 * @return The result of the callback, if any.
 */
PicturesqueApp.offline.Image.prototype.saveSuccessCallback = function() {
  return this.store.saveSuccessCallback(this.photoMetadata);
};


/**
 * Callback to PicturesqueApp.offline.get('lastUpdated'). Intended to update
 * the value during a save and delegate to success or failure.
 *
 * @param {Object} record The result of `get`ting the lastUpdated value.
 */
PicturesqueApp.offline.Image.prototype.maybeSetLastUpdated = function(record) {
  var callSetLastUpdated = true;
  var currentUpdatedStamp = this.photoMetadata[this.store.updatedPropertyName];
  if (record) {
    var current = new Date(record[PicturesqueApp.offline.LAST_UPDATED_KEY]);
    var proposed = new Date(currentUpdatedStamp);
    if (proposed <= current) {
      callSetLastUpdated = false;
    }
  }

  if (callSetLastUpdated) {
    // Need to wrap this.saveSuccessCallback in anon fn. so it can be
    // passed through to a method.
    var currentImage = this;
    var anonSaveCallback = function() {
      return currentImage.saveSuccessCallback();
    };
    PicturesqueApp.offline.setLastUpdated(
        currentUpdatedStamp, anonSaveCallback);
  } else {
    this.saveSuccessCallback();
  }
};


/**
 * Callback to occur after HTML5 filesystem save. Intended to store metadata
 * in local storage and delegate to maybeSetLastUpdated if the Image has an
 * updated value.
 */
PicturesqueApp.offline.Image.prototype.saveMetadata = function(record) {
  // Set the DB key based on the photo key. This succeeds whether or not the
  // key exists; cleans the index when it does exist.
  PicturesqueApp.offline.db.remove(this.photoMetadata.key);

  // Need to wrap this.saveSuccessCallback in anon fn. so it can be
  // passed through to a method.
  var currentImage = this;
  var saveCallback = function() {
    return currentImage.saveSuccessCallback();
  };
  // If photoMetadata has the updated property, we need to attempt to update
  // the value first. This check is actually relevant because we may save
  // photos directly from the UI which will have no `updated` property set
  // since no interaction with the server would have occurred yet.
  if (this.photoMetadata[this.store.updatedPropertyName]) {
    saveCallback = function() {
      // Need to wrap this.maybeSetLastUpdated in anon fn. so it can be
      // passed through to a method.
      var anonMaybeSet = function(record) {
        return currentImage.maybeSetLastUpdated(record);
      };
      PicturesqueApp.offline.applyLastUpdated(anonMaybeSet);
    };
  }

  PicturesqueApp.offline.db.save(this.photoMetadata, saveCallback);
};


/**
 * Callback to directly to filer.js HTML5 filesystem save. Receives callback
 * from save and delegates to saveMetadata after removing the save base64
 * image and replacing with the local filesystem URI.
 * @param {FileEntry} fileEntry Reference to the newly (locally) saved file.
 * @param {FileWriter} unusedFileWriter The writer used to save the file.
 */
PicturesqueApp.offline.Image.prototype.localFilesystemCallback =
    function(fileEntry, unusedFileWriter) {
  PicturesqueApp.offline.log.push(['write succeeded:', fileEntry,
                                   unusedFileWriter]);
  if (!this.photoMetadata.localOnly) {
    delete this.photoMetadata[this.store.base64PropertyName];
  }
  this.photoMetadata[this.store.localUriPropertyName] = fileEntry.toURL();

  this.saveMetadata();
};


//
// NetworkQueue class definition and prototype
//

/**
 * Constructor for a (FIFO) NetworkQueue instance. Intended to be used
 * for network tasks. Will produce a singleton object.
 */
PicturesqueApp.offline.NetworkQueue = function() {
  // http://stackoverflow.com/questions/1635800
  if (PicturesqueApp.offline.NetworkQueue._queueSingleton) {
    return PicturesqueApp.offline.NetworkQueue._queueSingleton;
  }

  PicturesqueApp.utils.Queue.call(this);
  // Override log
  this.log = PicturesqueApp.offline.log;
  PicturesqueApp.offline.NetworkQueue._queueSingleton = this;
};


/**
 * Set the parent class.
 */
PicturesqueApp.offline.NetworkQueue.prototype =
    new PicturesqueApp.utils.Queue();
PicturesqueApp.offline.NetworkQueue.prototype.constructor =
    PicturesqueApp.offline.NetworkQueue;


/**
 * Consumes a task from the queue.
 */
PicturesqueApp.offline.NetworkQueue.prototype.consume = function() {
  if (navigator.onLine) {
    PicturesqueApp.utils.Queue.prototype.consume.call(this);
  } else {
    this.started = false;
  }
};


/**
 * Singleton NetworkQueue for queueing network tasks.
 * @type {NetworkQueue}
 */
PicturesqueApp.offline.QUEUE = new PicturesqueApp.offline.NetworkQueue();


/**
 * Function which will start the QUEUE consuming. Since not bound to the
 * NetworkQueue prototype, this can be passed to other methods as a callback.
 * @type {Array.Function}
 */
PicturesqueApp.offline.startQueue = function() {
  if (PicturesqueApp.offline.QUEUE.started) {
    PicturesqueApp.offline.log.push(
        'startQueue called when already started.');
    return;
  }
  PicturesqueApp.offline.QUEUE.started = true;
  PicturesqueApp.offline.QUEUE.consume();
};


/**
 * Adds a task to the singleton queue and tries to start it.
 * @param {CallbackTask} task Task to be added to queue.
 */
PicturesqueApp.offline.addTaskToQueue = function(task) {
  PicturesqueApp.offline.QUEUE.tasks.push(task);
  PicturesqueApp.offline.startQueue();
};


/**
 * List of callbacks for ononline event.
 * @type {Array.Function}
 */
PicturesqueApp.offline.onOnlineCallbacks = [PicturesqueApp.offline.startQueue];


/**
 * An idempotent way to add a callback to window.ononline.
 * @type {Function} callback A function to be added to window.ononline.
 */
PicturesqueApp.offline.addOnOnlineCallback = function(callback) {
  // Thanks to http://stackoverflow.com/questions/14358613
  if (PicturesqueApp.offline.onOnlineCallbacks.indexOf(callback) < 0) {
    PicturesqueApp.offline.onOnlineCallbacks.push(callback);
  }
};


/**
 * A way to remove a callback from window.ononline.
 * @type {Function} callback A function to be removed from window.ononline.
 */
PicturesqueApp.offline.removeOnOnlineCallback = function(callback) {
  // Thanks to http://stackoverflow.com/questions/14358613
  var index = PicturesqueApp.offline.onOnlineCallbacks.indexOf(callback);
  if (index >= 0) {
    PicturesqueApp.offline.onOnlineCallbacks.splice(index, 1);
  }
};


/**
 * The window.ononline callback based on the list of registered callbacks.
 * It will call each of the callbacks asynchronously via setTimeout.
 */
PicturesqueApp.offline.onOnlineCallback = function() {
  var callback;
  for (var callbackIndex in PicturesqueApp.offline.onOnlineCallbacks) {
    callback = PicturesqueApp.offline.onOnlineCallbacks[callbackIndex];
    setTimeout(callback, 0);
  }
};


/**
 * Set the global (window) ononline callback.
 */
window.ononline = PicturesqueApp.offline.onOnlineCallback;
