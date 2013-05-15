# Copyright 2013 Google Inc. All Rights Reserved.

"""Module for definition of full-demo Picturesque API.

Since Google Cloud Endpoints uses method docstrings as descriptions in the
Discovery Document, we include the extended docstrings as comments below the
single sentence description for each method.
"""


from google.appengine.ext import deferred
from google.appengine.ext import endpoints
from google.appengine.ext import ndb
from protorpc import message_types
from protorpc import remote

import auth_util
from models import Photo
from models import PicturesqueUser
import settings


@endpoints.api(name='picturesque', version='v1',
               description='Photos API for Picturesque App',
               scopes=settings.API_SCOPES,
               allowed_client_ids=[settings.CLIENT_ID,
                                   endpoints.API_EXPLORER_CLIENT_ID])
class PicturesqueApi(remote.Service):
  """Service class for picturesque:v1 API."""

  # photo Resource
  @Photo.method(request_fields=Photo.NewPhotoSchema,
                path='photo', name='photo.create')
  def PhotoCreate(self, photo):
    """Simple method to create a photo with title and description."""

    # Args:
    #   photo: An instance of Photo parsed from the request.

    # Returns:
    #   The instance of Photo parsed from the request with a key added after
    #     after being inserted into the datastore and an owner added based on
    #     the current user.

    # Raises:
    #   endpoints.BadRequestException: if the request does not have a title
    #     or base64 photo contents. This results in a 400 response.
    # """
    current_picturesque_user = PicturesqueUser.RequirePicturesqueUser()
    photo.owner = current_picturesque_user.user_object

    if photo.title is None:
      raise endpoints.BadRequestException(Photo.TITLE_NEEDED)
    if photo.base64_photo is None:
      raise endpoints.BadRequestException(Photo.PHOTO_NEEDED)
    if photo.mime_type is None:
      raise endpoints.BadRequestException(Photo.MIME_TYPE_NEEDED)

    photo.put()
    return photo

  @Photo.method(request_fields=('key',),
                http_method='GET', path='photo/{key}', name='photo.read')
  def PhotoRead(self, photo):
    """Retrieve Photo with metadata by key."""

    # Sets the value of _is_mine based on whether the current user is the owner.

    # Args:
    #   photo: An instance of Photo parsed from the request.

    # Returns:
    #   The instance of Photo parsed from the request if the included key
    #     corresponds to an entity from the the datastore.

    # Raises:
    #   endpoints.NotFoundException: if the key from the request does not
    #     correspond to a Photo stored in the datastore. This results in a
    #     404 response.
    #   endpoints.ForbiddenException: if Photo exists, but the current user
    #     is not the owner or in the ACL. This results in a 403 response.
    # """
    current_picturesque_user = PicturesqueUser.RequirePicturesqueUser()

    if not photo.from_datastore:
      raise endpoints.NotFoundException(Photo.NOT_FOUND_ERROR)

    if photo.owner == current_picturesque_user.user_object:
      photo._is_mine = True
    # In the case the signed-in user is not the owner, check the ACL
    elif current_picturesque_user.googleplus_user_id not in photo.acl:
      raise endpoints.ForbiddenException(Photo.FORBIDDEN_ERROR)
    else:
      photo._is_mine = False

    return photo

  @Photo.method(request_fields=('key',),
                response_message=message_types.VoidMessage,
                http_method='DELETE', path='photo/{key}', name='photo.delete')
  def PhotoDelete(self, photo):
    """Delete Photo and metadata by key."""

    # Calls PicturesqueUser.RequireOwner to make sure there is a current user
    # and make sure that user owners the photo.

    # Args:
    #   photo: An instance of BasicPhoto parsed from the request.

    # Returns:
    #   An instance of message_types.VoidMessage. This results in a 204 no
    #    content response.
    # """
    PicturesqueUser.RequireOwner(photo)
    photo.key.delete()
    return message_types.VoidMessage()

  @Photo.method(request_message=Photo.ProtoModel(),
                http_method='PUT', path='photo/{key}', name='photo.update')
  def PhotoUpdate(self, photo_request):
    """Update Photo/metadata by key."""

    # Since setting 'key' on the entity would call the UpdateFromKey method
    # we need to manually perform the operations performed by
    # endpoints-proto-datastore. Instead of specifying request_fields, we
    # specify a Protobuf definition via request_message and compare that
    # value to any existing in the datastore.

    # Args:
    #   photo_request: A protorpc message parsed from the request; with message
    #     class corresponding to the Photo model.

    # Returns:
    #   The updated instance of Photo if the update was successful.
    # """
    return Photo.UpdatePhotoFromProto(photo_request)

  @Photo.method(request_fields=Photo.PatchPhotoSchema,
                http_method='PATCH', path='photo/{key}', name='photo.patch')
  def PhotoPatch(self, photo):
    """Patch Photo/metadata by key."""

    # Requires that the current user be an owner by using
    # PicturesqueUser.RequireOwner.

    # Args:
    #   photo: An instance of Photo parsed from the request.

    # Returns:
    #   The updated instance of Photo if the update was successful.
    # """
    PicturesqueUser.RequireOwner(photo)
    photo.put()
    return photo

  @Photo.query_method(query_fields=Photo.QueryFields,
                      path='photos', name='photo.list')
  def PhotoList(self, query):
    """Get list of Photos based on queries."""

    # The query user will be set by the setter for the 'ownerGoogleplusUserId'
    # property; this setter is always called since the propery has a default
    # value so the query will always specify an owner.

    # Args:
    #   query: An ndb.Query object corresponding to the Photo kind. Values
    #     from the request will already be added as filters or cursors in the
    #     request. The 'lastUpdated' and 'ownerGoogleplusUserId' especially
    #     perform a great deal on the query object in their setter methods.

    # Returns:
    #   The query object parsed from the request, sorted in ascending order by
    #     the 'updated' timestamp property.
    # """
    return query.order(Photo.updated)

  # users Resource
  @PicturesqueUser.method(request_message=message_types.VoidMessage,
                          user_required=True,
                          path='users/join', name='users.join')
  def SignUp(self, unused_request):
    """Sign up to create a Picturesque user account."""

    # Args:
    #   unused_request: An instance of message_types.VoidMessage. This allows us
    #     the method to require no input (other than a token).

    # Returns:
    #   The instance of PicturesqueUser that was either created or already
    #     existed.

    # Raises:
    #   endpoints.ForbiddenException: if the token can't access the current
    #     user's Google+ ID. This results in a 403 response.
    # """
    googleplus_user_id = auth_util.get_google_plus_user_id()
    if googleplus_user_id is None:
      raise endpoints.ForbiddenException(PicturesqueUser.NO_GPLUS_ID)

    # Will not be null since user_required=True
    current_user = endpoints.get_current_user()
    return PicturesqueUser.GetOrCreateAccount(current_user, googleplus_user_id)

  # acl Resource
  @Photo.method(request_fields=Photo.AddAclSchema,
                response_fields=Photo.AclSchema,
                path='acl/{key}', name='acl.addUsers')
  def AclInsert(self, photo):
    """Insert ACL for own photo."""

    # Only the key for retrieving the photo and an alias property containing
    # the new Google+ IDs to be added to the ACL.

    # Allows new users to be appended to the ACL for a given photo. Only the
    # owner can change ACLs. This is done by updated the 'acl' property on
    # the current photo.

    # Args:
    #   photo: An instance of Photo parsed from the request.

    # Returns:
    #   The updated instance of Photo if the ACL update was successful. Only the
    #     key and the new ACL list will be returned since the AclSchema is used
    #     for the response.
    # """
    current_picturesque_user = PicturesqueUser.RequireOwner(photo)
    googleplus_user_id = current_picturesque_user.googleplus_user_id

    def update_other_users():
      for acl_id in set(photo.acl_user_ids):
        # TODO(dhermes): Find and address the bug in endpoints-proto-datastore
        #                or ndb that causes this to be needed.
        if isinstance(acl_id, ndb.model._BaseValue):
          acl_id = acl_id.b_val

        if acl_id not in photo.acl:
          photo.acl.append(acl_id)
          deferred.defer(PicturesqueUser.UpdateInList, acl_id,
                         googleplus_user_id, _transactional=True)
      photo.put()

    # This spawns tasks for each new ACL user, but does so transactionally;
    # only if the photo object is put() successfully.
    ndb.transaction(update_other_users)
    return photo
