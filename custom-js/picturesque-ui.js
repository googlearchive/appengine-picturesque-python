// DEPENDS ON: jQuery loaded.
// DEPENDS ON: picturesque-config.js
// DEPENDS ON: picturesque-data.js
// DEPENDS ON: picturesque-api.js
// DEPENDS ON: picturesque-utils.js
// DEPENDS ON: picturesque-offline.js

'use strict';

/** Namespace for application */
var PicturesqueApp = PicturesqueApp || {};


/**
 * Placing this module within the application.
 *
 * Should only be defined here.
 */
PicturesqueApp.ui = {};


/**
 * Log to hold status messages from ui library.
 * @type {Array.Object}
 */
PicturesqueApp.ui.log = [];


/**
 * Indicates which photo column is ready to have a picture.
 * @type {integer}
 */
PicturesqueApp.ui.photoColumnReady = 0;


/**
 * Array of DOM element IDs corresponding to the column number.
 * @type {Array.string}
 */
PicturesqueApp.ui.photoColumnIdTable = [
  'picColumnLeft',
  'picColumnCenter',
  'picColumnRight'
];



/**
 * Shows the Google+ Sign-in button.
 */
PicturesqueApp.ui.showSigninButton = function() {
  // TODO(dhermes): Should we use $ or jQuery?
  var signinButtonContainer =
      $('#' + PicturesqueApp.config.SIGN_IN_BUTTON_CONTAINER_ID);
  signinButtonContainer.addClass('visible');
};


/**
 * Add the show button UI callback to the Sign-in failure callback registry.
 */
PicturesqueApp.api.addOnSigninFailureCallback(
    PicturesqueApp.ui.showSigninButton);


/**
 * Hides the Google+ Sign-in button.
 */
PicturesqueApp.ui.hideSigninButton = function() {
  // TODO(dhermes): Should we use $ or jQuery?
  var signinButtonContainer =
      $('#' + PicturesqueApp.config.SIGN_IN_BUTTON_CONTAINER_ID);
  signinButtonContainer.removeClass('visible');
};


/**
 * Add the hide button UI callback to the joinPicturesque callback queue.
 */
var task = new PicturesqueApp.utils.CallbackTask(
    PicturesqueApp.ui.hideSigninButton);
// TODO(dhermes): Consider adding a permanent list of callbacks for
//                joinPicturesque or an eqivalent of addOnSigninFailureCallback
//                in the Sign-in success case.
PicturesqueApp.data.JOIN_PICTURESQUE_QUEUE.tasks.push(task);


/**
 * Add an offline event listener which hides the Sign-in button (since we
 * can't do Sign-in while offline) if not already hidden and adds task
 * to offline queue to show the button (if it was not hidden) when coming
 * back online.
 */
window.addEventListener('offline', function() {
  var signinButtonContainer =
      $('#' + PicturesqueApp.config.SIGN_IN_BUTTON_CONTAINER_ID);
  if (signinButtonContainer.hasClass('visible')) {
    PicturesqueApp.ui.hideSigninButton();

    // If it was visible, make it visible again when back online.
    var task = new PicturesqueApp.utils.CallbackTask(
        PicturesqueApp.ui.showSigninButton);
    PicturesqueApp.offline.addTaskToQueue(task);
  }
}, true);


/**
 * Updates the connection status indicator.
 * @param {Boolean} offline Indicates if new status is online or offline.
 */
PicturesqueApp.ui.changeStatus = function(offline) {
  // TODO(dhermes): Do this with CSS and a class.
  if (offline) {
    $('#connStatus').attr('style', 'background: red');
    $('#connStatus').text('Offline');
    PicturesqueApp.ui.log.push(['We are offline', 'Connection status changed']);
  } else {
    $('#connStatus').text('Ready');
    $('#connStatus').attr('style', 'background: green');
    PicturesqueApp.ui.log.push(['We are online', 'Connection status changed']);
  }
};


/**
 * Add an offline event listener which hides the changes the connection status
 * to offline and adds ononline callback to change it back to online when
 * coming back online.
 */
window.addEventListener('offline', function() {
  PicturesqueApp.ui.changeStatus(true);
}, true);
PicturesqueApp.offline.addOnOnlineCallback(function() {
  PicturesqueApp.ui.changeStatus(false);
});


/**
 * Displays a toast message in the UI.
 * @param {string} msg The message to display.
 */
PicturesqueApp.ui.toastMsg = function(msg) {
  $('<div class="ui-loader ui-overlay-shadow ui-body-e ui-corner-all"><h3>' + msg + '</h3></div>')
  .css({ display: 'block',
    opacity: 0.90,
    position: 'fixed',
    padding: '7px',
    'text-align': 'center',
    width: '270px',
    left: ($(window).width() - 284)/2,
    top: $(window).height()/2 })
  .appendTo( $.mobile.pageContainer ).delay( 1500 )
  .fadeOut( 400, function(){
    $(this).remove();
  });
};


/**
 * Displays an are you sure message to user.
 * @param {string} title The dialog title.
 * @param {string} content The dialog content.
 * @param {string} button The dialog button content.
 * @param {string} ansCallback The dialog answer callback.
 */
PicturesqueApp.ui.areYouSure = function(title, content, button, ansCallback) {
  $('#sure .sure-title').text(title);
  $('#sure .sure-content').text(content);
  $('#sure .sure-do').text(button).on('click.sure', function() {
    ansCallback();
    $(this).off('click.sure');
  });
  $.mobile.changePage('#sure');
};


/**
 * Adds photo to the display. To be used to aid with callbacks in a
 * a PicturesqueApp.data.DataStore object.
 * @param {Object} photoMetadata An object containing photo contents.
 * @param {string} previousKey An optional argument corresponding to the
 *                             previous key used to store the value.
 *                             Defaults to the key from the photo metadata.
 */
PicturesqueApp.ui.displayPhoto = function(photoMetadata, previousKey) {
  var key = photoMetadata.key;
  previousKey = previousKey || key;
  var localUri = photoMetadata[PicturesqueApp.config.LOCAL_URI_PROPERTY_NAME];
  var title = photoMetadata[PicturesqueApp.config.TITLE_PROPERTY_NAME];
  if (!(key && localUri && title)) {
    // TODO(dhermes): Make this failure show up in the UI; if it ever occurs.
    PicturesqueApp.ui.log.push(['Unexpected photo metadata:', photoMetadata]);
    return;
  }

  // TODO(dhermes): Check if key already exists. This is a big issues when
  //                key != previousKey but should never occur.
  var dataItem = $('img[data-picid=' + previousKey + ']').parent();
  var newDomElement = false;
  if (dataItem.length === 0) {
    newDomElement = true;
    dataItem = $('<div class="item">');

    dataItem.append($('<img>'));

    imageCaption = $('<div class="carousel-caption">');
    imageCaption.append($('<span>'));  // Title span.
    imageCaption.append($('<p>'));  // Description paragraph.
    dataItem.append(imageCaption);
  }

  var img = dataItem.find('img');
  img.attr('src', localUri);
  img.attr('alt', title);
  img.attr('data-picid', key);

  // This uses the carousel option class provided by bootstrap.
  var imageCaption = dataItem.find('div.carousel-caption');

  var titleSpan = imageCaption.find('span');
  titleSpan.text(title);

  // TODO(dhermes): This should be conditional on the existence of a
  //                description.
  var descriptionPara = imageCaption.find('p');
  descriptionPara.text(
      photoMetadata[PicturesqueApp.config.DESCRIPTION_PROPERTY_NAME]);

  // TODO(dhermes): We should include the tags as well

  if (newDomElement) {
    var domId = PicturesqueApp.ui.photoColumnIdTable[
        PicturesqueApp.ui.photoColumnReady];
    PicturesqueApp.ui.photoColumnReady =
        (PicturesqueApp.ui.photoColumnReady + 1) % 3;
    $('#' + domId).append(dataItem);
  }
};


/**
 * Saves new photo and toasts. This is just a thin wrapper around
 * displayPhoto that adds a toast.
 * @param {Object} photoMetadata An object containing photo contents.
 */
PicturesqueApp.ui.saveNewPhoto = function(photoMetadata) {
  PicturesqueApp.ui.displayPhoto(photoMetadata);

  if (photoMetadata.localOnly) {
    var title = photoMetadata[PicturesqueApp.config.TITLE_PROPERTY_NAME];
    PicturesqueApp.ui.toastMsg(
        'Picturesque ' + JSON.stringify(title) + ' has been saved locally.');
  }
};


/**
 * Renames a photo. This is just a thin wrapper around displayPhoto
 * tailored to the signature needed for renameCallback.
 * @param {string} previousKey The previous key used to store the value.
 * @param {Object} photoMetadata An object containing photo contents.
 */
PicturesqueApp.ui.renameLocalPhoto = function(previousKey, photoMetadata) {
  PicturesqueApp.ui.displayPhoto(photoMetadata, previousKey);

  var title = photoMetadata[PicturesqueApp.config.TITLE_PROPERTY_NAME];
  PicturesqueApp.ui.toastMsg(
      'Picturesque ' + JSON.stringify(title) +
      ' has been saved in the clouds.');
};


/**
 * Clears all input fields for image "Save".
 */
PicturesqueApp.ui.clearSaveFields = function() {
  $('#PicturesqueDetailsModal input[id^=\'Picturesque\']').each(function() {
    $(this).val('');
  });
  $('#PicturesqueDetailsModal textarea[id^=\'Picturesque\']').each(function() {
    $(this).val('');
  });
  $('#PicturesqueDetailsModal #imgCaptured').html('');
  document.getElementById('uploadImg').value = '';
};


/**
 * Create a DataStore for tying our UI methods to the data.
 */
PicturesqueApp.ui.storeArgs = {
  'saveSuccessCallback': PicturesqueApp.ui.saveNewPhoto,
  'getPhotoCallback': PicturesqueApp.ui.displayPhoto,
  'renameCallback': PicturesqueApp.ui.renameLocalPhoto
};
PicturesqueApp.ui.STORE = new PicturesqueApp.data.DataStore(PicturesqueApp.ui.storeArgs);


/**
 * Adding behavior to DOM elements.
 */
$(document).ready(function() {

  /**
   * On-click handler for the "Cancel" button in "Save" menu. Clears input
   * fields and hides the details.
   */
  $('#cancelPicturesque').click(function(data) {
    PicturesqueApp.ui.clearSaveFields();
    $('#PicturesqueDetailsModal').modal('hide');
  });

  /**
   * On-click handler for the "Upload" button in "Save" menu. Tries to convert
   * file object to a data URL and sets it in the #imgCaptured DOM element.
   */
  $('#uploadImg').change(function() {
    var file = this.files[0];
    PicturesqueApp.ui.log.push(['Retrieved file.', 'Name:', file.name,
                                'Size:', file.size, 'Type:', file.type]);
    try {
      var reader = new FileReader();
      reader.onload = function (e) {
        var imgSrc = e.target.result;
        $('#imgCaptured').html('');  // In case other photos had been added
        $('#imgCaptured').append('<img id="upImg" src="' + imgSrc +
         '" alt="uploaded image" />');
      }
      reader.readAsDataURL(file);
    } catch(error) {
      PicturesqueApp.ui.log.push(['Error putting image into image tag:',
                                  error]);
    }
  });

  /**
   * On-click handler for the "Save" button in "Save" menu. Gathers the API
   * payload from the form and calls addPhoto on the form.
   */
  $('#savePicturesque').click(function() {
    var title = $('#PicturesqueDetailsModal input[name=' +
                  PicturesqueApp.config.TITLE_PROPERTY_NAME + ']').val();
    var description = $('#PicturesqueDetailsModal textarea[name=' +
                        PicturesqueApp.config.DESCRIPTION_PROPERTY_NAME +
                        ']').val();
    if (description.length === 0) {
      description = undefined;  // Don't send an empty string, should be null
    }

    // TODO(dhermes): Bail out if this fails. Currently only save if true.
    if ($('#upImg')[0] !== null) {
      // UI guarantees at most one image from the "Save" menu.
      var tmpImg = $('#upImg')[0];
      var imgInfo = PicturesqueApp.utils.getBase64ContentsAndMimeType(tmpImg);
      var base64Photo = imgInfo[0];
      // TODO(dhermes): Don't allow mime-type that doesn't begin with "image/"
      var mimeType = imgInfo[1];

      PicturesqueApp.ui.STORE.addPhoto(title, base64Photo,
                                       mimeType, description);
      PicturesqueApp.ui.clearSaveFields();
    }

  });

  /**
   * Conditional event listener for application cache updates. If there is
   * an application cache and it has been updated, prompts users with an
   * option to update the cache.
   */
  if (window.applicationCache) {
    window.applicationCache.addEventListener('updateready', function() {
      var title = 'An update is available';
      var content = 'Reload now?';
      var buttonContent = 'Yep - Please';
      var ansCallback = function() {
        window.location.reload();
      };
      PicturesqueApp.ui.areYouSure(title, content, buttonContent, ansCallback);
    });
  }

  /**
   * Reloads page if user clicks "Reload" button.
   */
  $('#reload').live('click', function(e) {
    window.location.reload();
  });

  /**
   * Populate the connection status based on initial signed in status.
   */
  PicturesqueApp.ui.changeStatus(!navigator.onLine);

  /**
   * Add tooltip to anchors.
   */
  // TODO(dhermes): Is this being used?
  $('a').tooltip();

});
