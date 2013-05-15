// DEPENDS ON: picturesque-utils.js
// DEPENDS ON: picturesque-config.js
// DEPENDS ON: picturesque-data.js
// DEPENDS ON: gapi being loaded into the DOM via client:plusone.js

'use strict';

/** Namespace for application */
var PicturesqueApp = PicturesqueApp || {};


/**
 * Placing this module within the application.
 *
 * Should only be defined here.
 */
PicturesqueApp.api = {};


/**
 * Log to hold status messages from api library.
 * @type {Array.Object}
 */
PicturesqueApp.api.log = [];


/**
 * Indicates whether the gapi library has been loaded.
 * @type {Boolean}
 */
PicturesqueApp.api.gapiLoaded = false;


/**
 * Constructs calls to the Picturesque API.
 * @param {string} resourceName The name of the API resource, e.g. 'photo'
 *                              or 'users'.
 * @param {string} methodName The name of the API method, e.g. 'get'.
 * @param {Object} payload The contents being sent in the API request.
 * @param {Function} callback The method to handle the API response.
 */
PicturesqueApp.api.callPicturesqueAPI =
      function(resourceName, methodName, payload, callback) {
  var rpcMethodName = [
      PicturesqueApp.config.API_NAME,
      resourceName,
      methodName,
  ].join('.');

  var rpcRequestObject = gapi.client.rpcRequest(
      rpcMethodName,
      PicturesqueApp.config.API_VERSION,
      payload
  );

  rpcRequestObject.b.transport.root = PicturesqueApp.config.API_ROOT;
  rpcRequestObject.execute(callback);
}


/**
 * Renders the Google+ Sign-in button using parameters from the config module.
 */
PicturesqueApp.api.renderButton = function() {
  PicturesqueApp.api.gapiLoaded = true;
  gapi.signin.render(PicturesqueApp.config.SIGN_IN_BUTTON_ID, {
    'callback': PicturesqueApp.api.signinCallback,
    'clientid': PicturesqueApp.config.CLIENT_ID,
    'cookiepolicy': 'single_host_origin',
    'requestvisibleactions': 'http://schemas.google.com/AddActivity',
    'scope': PicturesqueApp.config.SCOPES
  });
};
// A quirk of the JSONP callback of the plusone client makes it so
// our callback must exist as an element in window.
window['PicturesqueApp.api.renderButton'] = PicturesqueApp.api.renderButton;


/**
 * Loads the Google+ script asynchronously if not yet loaded.
 */
PicturesqueApp.api.loadGapi = function() {
  if (PicturesqueApp.api.gapiLoaded) {
    return;
  }

  var newScriptElement = document.createElement('script');
  newScriptElement.type = 'text/javascript';
  newScriptElement.async = true;
  newScriptElement.src = 'https://apis.google.com/js/client:plusone.js' +
                         '?onload=PicturesqueApp.api.renderButton';
  var firstScriptElement = document.getElementsByTagName('script')[0];
  firstScriptElement.parentNode.insertBefore(newScriptElement,
                                             firstScriptElement);
};


/**
 * List of callbacks for when signinCallback registered a failed Sign-in.
 * @type {Array.Function}
 */
// TODO(dhermes): Make this more generic since we are doing the exact same
//                thing in picturesque-offline.js.
PicturesqueApp.api.onSigninFailureCallbacks = [];


/**
 * An idempotent way to add a callback to the Sign-in failure response.
 * @type {Function} callback A function to be added.
 */
PicturesqueApp.api.addOnSigninFailureCallback = function(callback) {
  // Thanks to http://stackoverflow.com/questions/14358613
  var index = PicturesqueApp.api.onSigninFailureCallbacks.indexOf(callback);
  if (index < 0) {
    PicturesqueApp.api.onSigninFailureCallbacks.push(callback);
  }
};


/**
 * A way to remove a callback from the Sign-in failure response.
 * @type {Function} callback A function to be removed.
 */
PicturesqueApp.api.removeOnSigninFailureCallback = function(callback) {
  // Thanks to http://stackoverflow.com/questions/14358613
  var index = PicturesqueApp.api.onSigninFailureCallbacks.indexOf(callback);
  if (index >= 0) {
    PicturesqueApp.api.onSigninFailureCallbacks.splice(index, 1);
  }
};


/**
 * The Sign-in failure callback based on the list of registered callbacks.
 * It will call each of the callbacks asynchronously via setTimeout.
 */
PicturesqueApp.api.onSigninFailureCallback = function() {
  var callback;
  for (var callbackIndex in PicturesqueApp.api.onSigninFailureCallbacks) {
    callback = PicturesqueApp.api.onSigninFailureCallbacks[callbackIndex];
    setTimeout(callback, 0);
  }
};


/**
 * Handles the Google+ Sign In response.
 *
 * Success calls PicturesqueApp.data.joinPicturesque. Failure goes through the
 * list of local callbacks.
 *
 * @param {Object} authResult The contents returned from the Google+
 *                            Sign In attempt.
 */
PicturesqueApp.api.signinCallback = function(authResult) {
  if (authResult.access_token) {
    // Successfully authorized
    PicturesqueApp.data.joinPicturesque();
  } else {
    PicturesqueApp.api.onSigninFailureCallback();

    // Log the outcome for debugging purposes
    if (!authResult.error) {
      PicturesqueApp.api.log.push(['signinCallback() no error:', authResult]);
    } else if (authResult.error !== 'immediate_failed') {
      PicturesqueApp.api.log.push(['signinCallback() unexpected error:',
                                   authResult.error]);
    } else {
      PicturesqueApp.api.log.push(['signinCallback()', 'Immediate mode failed',
                                   'user needs to click Sign In.']);
    }
  }
};
