// DEPENDS ON: Nothing

'use strict';

/** Namespace for application */
var PicturesqueApp = PicturesqueApp || {};


/**
 * Placing this module within the application.
 *
 * Should only be defined here.
 */
PicturesqueApp.utils = {};


/**
 * Maximum image width that can be uploaded.
 * @type {integer}
 */
PicturesqueApp.utils.MAX_WIDTH = 600;


/**
 * Maximum image height that can be uploaded.
 * @type {integer}
 */
PicturesqueApp.utils.MAX_HEIGHT = 400;


/**
 * Converts a base64 image to a blob.
 *
 * @param {string} base64value A base64 version of an image.
 * @param {string} mimeType The MIME type of the content.
 * @return {Blob} The image as a blob.
 */
PicturesqueApp.utils.base64ToBlob = function(base64value, mimeType) {
  // convert base64 to raw binary data held in a string
  var byteString = atob(base64value);
  // write the bytes of the string to an ArrayBuffer
  var arrayBuffer = new ArrayBuffer(byteString.length);
  var intArray = new Uint8Array(arrayBuffer);
  for (var i = 0; i < byteString.length; i++) {
    intArray[i] = byteString.charCodeAt(i);
  }
  var dataView = new DataView(arrayBuffer);

  // write the ArrayBuffer to a blob, and you're done
  return new Blob([dataView], {'type': mimeType});
};


/**
 * Resizes <img> tag to a data URL sized down to the correct
 * size (at most 600 width by 400 height).
 *
 * This is needed since Google App Engine datastore entities are capped at
 * 1MB. We recommend using Google Cloud Storage for larger images.
 *
 * @param {DOM Element} img An <img> tag where an image was uploaded.
 * @return {string} The data URL of the sized down image.
 */
PicturesqueApp.utils.resizeBase64Image = function(img) {

  var width = img.naturalWidth;
  var height = img.naturalHeight;

  var changed = false;
  if (width > height) {
    if (width > PicturesqueApp.utils.MAX_WIDTH) {
      changed = true;
      height *= PicturesqueApp.utils.MAX_WIDTH / width;
      width = PicturesqueApp.utils.MAX_WIDTH;
    }
  } else {
    if (height > PicturesqueApp.utils.MAX_HEIGHT) {
      changed = true;
      width *= PicturesqueApp.utils.MAX_HEIGHT / height;
      height = PicturesqueApp.utils.MAX_HEIGHT;
    }
  }

  if (changed) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    // Get the data-URL formatted image
    return canvas.toDataURL('image/png');
  } else {
    return img.src;
  }
};


/**
 * Gets base64 contents and MIME type from a DOM element.
 *
 * @param {DOM Element} uploadedImg The <img> tag where an image was uploaded.
 * @return {Array[2]} The base64 contents of the photo and the MIME type.
 */
PicturesqueApp.utils.getBase64ContentsAndMimeType = function(uploadedImg) {
  var dataURL = PicturesqueApp.utils.resizeBase64Image(uploadedImg);
  var base64Photo = dataURL.split(',')[1];
  var mimeType = dataURL.split(',')[0].split('data:')[1].split(';')[0];
  // TODO(dhermes): Fail if it doesn't begin with 'data:'
  // TODO(dhermes): Fail if it has more than one ','
  return [base64Photo, mimeType];
};


/**
 * Applies a simple hashing algorithm to a string. From:
 * http://stackoverflow.com/questions/7616461
 *
 * @param {string} stringValue A string to be hashed.
 * @return {integer} The hash value of the string.
 */
PicturesqueApp.utils.hashCode = function(stringValue) {
  var perCharMethod = function(hash, char) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    return hash & hash;
  };
  return stringValue.split('').reduce(perCharMethod, 0);
};


/**
 * Returns a temporary hash value. Intended to be used as a key for photo
 * metadata before being stored on the server.
 *
 * @return {string} A hash string based on the current time.
 */
PicturesqueApp.utils.temporaryHash = function() {
  var isoString = (new Date()).toISOString();
  var hashCode = PicturesqueApp.utils.hashCode(isoString);
  return 'hash-' + hashCode.toString();
};


//
// CallbackTask class definition and prototype
//

/**
 * Constructor for a CallbackTask instance.
 *
 * Accepts a callback and uses `arguments` to determine
 * and save anything to be passed to the callback.
 *
 * @param {Function} callback Function to be called when the task executes.
 */
PicturesqueApp.utils.CallbackTask = function(callback) {
  // TODO(dhermes): Allow this to be passed in to the constructor.
  this.triesRemaining = 3;
  this.callback = callback;
  this.callbackArguments = Array.prototype.slice.call(
      arguments, 1, arguments.length);
};


/**
 * Applies the callback to the stored arguments.
 */
PicturesqueApp.utils.CallbackTask.prototype.callTask = function() {
  if (this.triesRemaining === 0) {
    return;
  }

  this.triesRemaining--;
  return this.callback.apply(this, this.callbackArguments);
};


//
// Queue class definition and prototype
//

/**
 * Constructor for a (FIFO) Queue instance.
 */
PicturesqueApp.utils.Queue = function() {
  this.started = false;
  this.tasks = [];
  this.log = [];  // Can be customized
};


/**
 * Consumes a task from the queue.
 */
PicturesqueApp.utils.Queue.prototype.consume = function() {
  if (this.tasks.length === 0) {
    this.started = false;
    return;
  }

  this.started = true;
  var task = this.tasks.shift();
  try {
    task.callTask();
  } catch (error) {
    this.log.push(['Queue.consume error:', error]);
    this.tasks.push(task);  // Move failure to the end
  }
  // Continue to consume until tasks run out or are paused.
  this.consume();
};
