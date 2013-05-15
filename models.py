# Copyright 2013 Google Inc. All Rights Reserved.

"""Module containing model definitions for API data."""


import datetime
import re

from google.appengine.api import datastore_errors
from google.appengine.ext import endpoints
from google.appengine.ext import ndb
from protorpc import messages

from endpoints_proto_datastore.ndb import EndpointsAliasProperty
from endpoints_proto_datastore.ndb import EndpointsComputedProperty
from endpoints_proto_datastore.ndb import EndpointsModel
from endpoints_proto_datastore import MessageFieldsSchema
from endpoints_proto_datastore import utils

import auth_util


TAG_REGEX = re.compile('^#(?P<tag>([a-zA-Z0-9_]+))$')
OWNER_GOOGLEPLUS_USER_ID_DEFAULT = 'me'


class PicturesqueUser(EndpointsModel):
  """Model for holding Picturesque user information.

  This allows us to track pieces of information about a user.

  Attributes:
    user_object: The App Engine User corresponding to our Picturesque User
      account.
    in_users_acl_list: List of Google+ User IDs for other users that have at
      least one Photo with this user in the ACL.
    googleplus_user_id: String containing Google+ User ID. Also the key for the
      given entity.
  """

  BAD_USER = 'Account discrepancy.'
  INVALID_TOKEN = 'Invalid token.'
  NO_ACCOUNT = 'You don\'t have a Picturesque account.'
  NO_GPLUS_ID = 'Insufficient Permission.'

  user_object = ndb.UserProperty('userObject', indexed=False)
  in_users_acl_list = ndb.StringProperty('inUsersAclList',
                                         repeated=True, indexed=False)

  def CantSet(self, unused_value):
    """Dummy setter for properties which can't be set.

    Args:
      unused_value: The value attempting to be set. Will not be used.

    Raises:
      endpoints.BadRequestException: if the value was attempted to be set.
        This results in a 400 response.
    """
    raise endpoints.BadRequestException('Can\'t set googleplusUserId.')

  @EndpointsAliasProperty(name='googleplusUserId', setter=CantSet)
  def googleplus_user_id(self):
    """The ID that the entity is stored with.

    This will always be the Google+ ID.
    """
    return self.key.string_id()

  @property
  def email(self):
    """The email of the stored user object.

    Assumes the user_object is not None.
    """
    return self.user_object.email()

  @property
  def user_id(self):
    """The App Engine user ID of the stored user object.

    Assumes the user_object is not None.
    """
    return self.user_object.user_id()

  @classmethod
  def RequirePicturesqueUser(cls):
    """Makes sure the user from the environment has a Picturesque account.

    Checks first that there is a valid endpoints user, then checks if the
    current token can allow access to the user's Google+ ID and finally
    checks that a corresponding PicturesqueUser for that Google+ ID exists.

    Returns:
      The PicturesqueUser entity corresponding to the token user from the
        environment.

    Raises:
      endpoints.UnauthorizedException: If there is no endpoints current user.
        This results in a 401 response.
      endpoints.ForbiddenException: If either the token can't access the Google+
        ID or no Picturesque account exists for the user. This results in a 403
        response.
    """
    current_user = endpoints.get_current_user()
    if current_user is None:
      raise endpoints.UnauthorizedException(cls.INVALID_TOKEN)

    googleplus_user_id = auth_util.get_google_plus_user_id()
    if googleplus_user_id is None:
      raise endpoints.ForbiddenException(cls.NO_GPLUS_ID)

    existing_picturesque_user = cls.get_by_id(googleplus_user_id)
    if existing_picturesque_user is None:
      raise endpoints.ForbiddenException(cls.NO_ACCOUNT)

    return existing_picturesque_user

  @classmethod
  def RequireOwner(cls, photo_entity):
    """Makes sure user from env. has Picturesque account and owns entity.

    First makes sure the entity exists in the datastore (since something that
    doesn't exist can't have an owner), then calls RequirePicturesqueUser to
    make sure there is a valid Picturesque user in the environment. Then checks
    if the current user is the owner of the passed in photo entity.

    Args:
      photo_entity: A Photo entity parsed from a request.

    Returns:
      The PicturesqueUser entity corresponding to the token user from the
        environment.

    Raises:
      endpoints.NotFoundException: If the photo entity is not stored in the
        datastore. This results in a 404 response.
      endpoints.ForbiddenException: If the current user is not the owner. This
        results in a 403 response.
    """
    if not photo_entity.from_datastore:
      raise endpoints.NotFoundException(Photo.NOT_FOUND_ERROR)

    current_picturesque_user = cls.RequirePicturesqueUser()

    if photo_entity.owner != current_picturesque_user.user_object:
      raise endpoints.ForbiddenException(Photo.FORBIDDEN_ERROR)

    return current_picturesque_user

  @classmethod
  def ExistingAccount(cls, googleplus_user_id):
    """Determine whether or not an account exists for the given Google+ ID.

    If the account lookup fails due to a datastore error, ignores the error
    and just returns None. If there is a PicturesqueUser entity stored with
    no user_object, this means UpdateInList created a partial account, so
    None would be returned there too.

    Args:
      googleplus_user_id: String; the Google+ ID of a user.

    Returns:
      PicturesqueUser entity if an account exists, else None.
    """
    picturesque_user = None

    try:
      picturesque_user = cls.get_by_id(googleplus_user_id)
    except datastore_errors.Error:
      pass

    if picturesque_user is not None:
      if picturesque_user.user_object is not None:
        return picturesque_user

  @classmethod
  @ndb.transactional
  def UpdateInList(cls, shared_with_user_id, sharing_user_id):
    """Tracks the sharing user in an ACL list for a shared-with user.

    If the shared with user doesn't exist, creates a dummy account for them
    in case they later sign up. This is accounted for in GetOrCreateAccount.

    Args:
      shared_with_user_id: String; the Google+ ID of a user being added to a
        photo ACL.
      sharing_user_id: String; the Google+ ID of the user adding others to a
        photo ACL.
    """
    shared_with_user = cls.get_by_id(shared_with_user_id)
    if shared_with_user is None:
      shared_with_user = cls(id=shared_with_user_id)

    if sharing_user_id not in shared_with_user.in_users_acl_list:
      shared_with_user.in_users_acl_list.append(sharing_user_id)
      shared_with_user.put()

  @classmethod
  @ndb.transactional
  def GetOrCreateAccount(cls, current_user, googleplus_user_id):
    """Gets or creates a Picturesque user account for current user.

    In cases where the PicturesqueUser already exists for a Google+ User ID,
    but no user object is stored, we simply add the current user to that
    Picturesque user. This is because we allow partial accounts to be created by
    UpdateInList for ACL purposes.

    Args:
      current_user: The current user in the environment, validated from the
        caller.
      googleplus_user_id: String; the Google+ ID of the user from the request.

    Returns:
      The instance of PicturesqueUser that was either created or already
        existed.

    Raises:
      endpoints.ForbiddenException: if there is an existing Picturesque user
        account for the passed in Google+ ID that conflicts with the current
        user. This results in a 403 response.
    """
    existing_user = cls.get_by_id(googleplus_user_id)
    if existing_user is not None:
      if existing_user.user_object is None:
        # This is to support users who had their G+ ID added to an ACL before
        # they created an account.
        existing_user.user_object = current_user
        existing_user.put()
      elif existing_user.user_object != current_user:
        raise endpoints.ForbiddenException(cls.BAD_USER)

      return existing_user

    new_user = cls(id=googleplus_user_id, user_object=current_user)
    new_user.put()
    return new_user


class Photo(EndpointsModel):
  """Model for holding Photo information.

  Attributes:
    _message_fields_schema: List of fields which appear in API requests.
    title: String; title for photo.
    description: String; long description of what is in photo.
    base64_photo: String; contents of photo from a base64 data url.
    mime_type: String; MIME type of photo.
    updated: Date time corresponding to last update of stored photo.
    owner: App Engine User Property corresponding to the owner of the Photo.
    acl: List of Google+ User IDs (as strings) that the owner has shared the
      photo with.
    tags: List of strings, parsed hashtags from description.
    key: String version of the integer ID automatically allocated from the
      datastore. We use a string since Python long() values can exceed 2**53,
      which is the maximum precision for JavaScript integers.
    last_updated: String containing a timestamp. This is used as a helper
      property for queries to allow getting entities after a certain time.
    acl_user_ids: List of string Google+ IDs of user IDs to be added to an ACL.
      This is not stored anywhere and is only meant for the request.
    is_mine: Boolean representing whether the entity is owned by the current
      user. This is for entities owned by someone else with the current user in
      the ACL.
    owner_googleplus_user_id: String containing a Google+ ID. This is used as a
      helper property for queries to allow searching for all photos owned by
      a user which have the current user in an ACL.

    NewPhotoSchema: The schema (for the Discovery Document) used for new photos.
    AddAclSchema: The schema to be used for add ACL requests. Though the number
      of fields is small, having a distinct name is more relevant for discovery.
    AclResponseSchema: The schema to be used for ACL responses. Though the
      number of fields is small, having a distinct name is more relevant for
      discovery.
    QueryFields: Tuple of fields to be used in picturesque.photo.list. A
      MessageFieldsSchema is not needed since queries only use parameters.
  """

  FORBIDDEN_ERROR = 'You do not have access to this photo.'
  KEY_WRONG_FORMAT = 'Key must be a string value of integer.'
  MIME_TYPE_NEEDED = 'Photo MIME type must be described.'
  NOT_FOUND_ERROR = 'Photo not found.'
  PHOTO_NEEDED = 'Base64 Photo contents required.'
  TITLE_NEEDED = 'Photo must have a title.'

  # Non-default schemas
  NewPhotoSchema = MessageFieldsSchema(
      ('title', 'description', 'base64Photo', 'mimeType'), name='NewPhoto')
  PatchPhotoSchema = MessageFieldsSchema(
      ('key', 'title', 'description'), name='PhotoPatch')
  AddAclSchema = MessageFieldsSchema(
      ('key', 'aclUserIds'), name='NewAcl')
  AclSchema = MessageFieldsSchema(
      ('key', 'acl'), name='Acl')
  QueryFields = (  # Don't need a schema since GET doesn't use schema
    'lastUpdated',
    'limit',
    'ownerGoogleplusUserId',
    'pageToken',
    'tags',
    'title',
  )

  # Default schema
  _message_fields_schema = ('key', 'title', 'description', 'base64Photo',
                            'mimeType', 'updated', 'tags', 'isMine')

  title = ndb.StringProperty()
  description = ndb.StringProperty(indexed=False)
  base64_photo = ndb.BlobProperty('base64Photo', indexed=False)
  mime_type = ndb.StringProperty('mimeType', indexed=False)
  updated = ndb.DateTimeProperty(auto_now=True)
  owner = ndb.UserProperty(required=True)
  acl = ndb.StringProperty(repeated=True)

  @EndpointsComputedProperty(repeated=True)
  def tags(self):
    """Computed property that parses hash tags from description."""
    if self.description is None:
      return []

    tags = []
    for phrase in self.description.split():
      match = TAG_REGEX.match(phrase)
      if match is not None:
        tags.append(match.group('tag'))
    return tags

  def KeySet(self, value):
    """Setter for 'key' property.

    If the key is valid, tries to update properties on the current entity with
    values from the datastore if an entity is stored there using the key.

    Args:
      value: String (of integer value), the value attempting to be set.

    Raises:
      endpoints.BadRequestException: if the value was not able to be cast into
        a long. This results in a 400 response.
    """
    try:
      value = long(value)
    except (TypeError, ValueError):
      raise endpoints.BadRequestException(Photo.KEY_WRONG_FORMAT)

    self.UpdateFromKey(ndb.Key(Photo, value))

  @EndpointsAliasProperty(setter=KeySet)
  def key(self):
    """The key of the Photo.

    Returns:
      Integer ID as a string if there is a key and the key has an integer ID.
    """
    if self._key is not None and self._key.integer_id() is not None:
      return str(self._key.integer_id())

  def LastUpdatedSet(self, value):
    """Setter for 'lastUpdated' property.

    If the value is a valid timestamp, updates the query info of the current
    entity with a query for entities that were updated **AFTER** the parsed
    timestamp.

    Args:
      value: String (of timestamp), the value attempting to be set.

    Raises:
      endpoints.BadRequestException: if the value was not able to be cast into
        a datetime stamp. This results in a 400 response.
    """
    try:
      last_updated = utils.DatetimeValueFromString(value)
      if not isinstance(last_updated, datetime.datetime):
        raise TypeError('Not a datetime stamp.')
    except TypeError:
      raise endpoints.BadRequestException('Invalid timestamp for lastUpdated.')

    self._endpoints_query_info._filters.add(Photo.updated >= last_updated)

  @EndpointsAliasProperty(name='lastUpdated', setter=LastUpdatedSet)
  def last_updated(self):
    """Getter for 'lastUpdated' property.

    This is not meant to be accessed so will always fail. The setter is in place
    to set the query info.

    Raises:
      endpoints.BadRequestException: Always. This results in a 400 response.
    """
    raise endpoints.BadRequestException(
        'lastUpdated value should never be accessed.')

  _acl_user_ids = None

  def SetAclUserIds(self, value):
    """Setter for 'aclUserIds' property.

    This checks that the value is a list and all the values are non-empty
    strings.

    Args:
      value: List of Google+ IDs as strings.

    Raises:
      endpoints.BadRequestException: If the value is not a list or one of the
        values in the list is not a non-empty string. This results in a
        400 response.
    """
    valid_input = True
    if not isinstance(value, list):
      valid_input = False
    else:
      for acl_value in value:
        if not (isinstance(acl_value, basestring) and acl_value):
          valid_input = False
          break

    if not valid_input:
      raise endpoints.BadRequestException(
          'ACL user IDs must be non-empty strings.')

    self._acl_user_ids = value

  @EndpointsAliasProperty(name='aclUserIds', setter=SetAclUserIds,
                          repeated=True)
  def acl_user_ids(self):
    """Getter for 'aclUserIds' property.

    Returns:
      Empty list if the value is not set, otherwise the protected value
        _acl_user_ids set by SetAclUserIds.
    """
    if self._acl_user_ids is None:
      return []
    else:
      return self._acl_user_ids

  def SetIsMine(self, unused_value):
    """Setter for 'isMine' property.

    Args:
      unused_value: The value attempting to be set. Will not be used.

    Raises:
      endpoints.BadRequestException: if the value was attempted to be set.
        This results in a 400 response.
    """
    raise endpoints.BadRequestException('isMine can\'t be set.')


  @EndpointsAliasProperty(name='isMine', setter=SetIsMine,
                          property_type=messages.BooleanField)
  def is_mine(self):
    """Getter for 'isMine' property.

    Returns:
      Boolean indicating whether the current user owns the current entity.
    """
    current_picturesque_user = PicturesqueUser.RequirePicturesqueUser()
    return current_picturesque_user.user_object == self.owner

  def SetOwnerGoogleplusUserId(self, value):
    """Setter for 'ownerGoogleplusUserId' property.

    If the value is the default ('me'), updates the query to find photos owned
    by the current user. If the value is otherwise, first validates that ID
    corresponds to a valid Picturesque user, then finds all photos for that
    user which the current user in an ACL by adding query filters on the 'owner'
    and 'acl' properties.

    Args:
      value: Google+ ID as string, the value attempting to be set.

    Raises:
      endpoints.BadRequestException: if no account exists for the owner ID
        passed in (if not the default). This results in a 400 response.
    """
    current_picturesque_user = PicturesqueUser.RequirePicturesqueUser()

    if value == OWNER_GOOGLEPLUS_USER_ID_DEFAULT:
      owner_filter = (Photo.owner == current_picturesque_user.user_object)
    else:
      acl_filter = (Photo.acl == current_picturesque_user.googleplus_user_id)
      self._endpoints_query_info._AddFilter(acl_filter)

      owner_picturesque_user = PicturesqueUser.ExistingAccount(value)
      if owner_picturesque_user is None:
        raise endpoints.NotFoundException(
            'Account for Google+ Owner ID not found.')
      owner_filter = (Photo.owner == owner_picturesque_user.user_object)

    self._endpoints_query_info._AddFilter(owner_filter)


  @EndpointsAliasProperty(name='ownerGoogleplusUserId',
                          setter=SetOwnerGoogleplusUserId,
                          default=OWNER_GOOGLEPLUS_USER_ID_DEFAULT)
  def owner_googleplus_user_id(self):
    """Getter for 'ownerGoogleplusUserId' property.

    This is not meant to be accessed so will always fail. The setter is in place
    to set the query info.

    Raises:
      endpoints.BadRequestException: Always. This results in a 400 response.
    """
    raise endpoints.BadRequestException(
        'ownerGoogleplusUserId value should never be accessed.')

  @classmethod
  @ndb.transactional(xg=True)
  def UpdatePhotoFromProto(cls, photo_request):
    """Uses UPDATE semantics to update a photo from a Protobuf.

    This is necessary since the typical behavior via 'key' is to call
    UpdateFromKey which PATCHes in values from the datastore if the entity
    already exists. This contradicts the semantics of UPDATE.

    In doing this, we again validate the title and base64 photo contents (as in
    create), we require the current user has a valid account and is the owner.

    Args:
      photo_request: A protorpc message corresponding to the Photo model.

    Returns:
      The updated Photo instance.

    Raises:
      endpoints.BadRequestException: if the key from the request is invalid (as
        a integer serialized to string) or causes a datastore error. This
        results in a 400 response.
      endpoints.NotFoundException: If the photo entity is not stored in the
        datastore. This results in a 404 response.
      endpoints.BadRequestException: if the request does not have a title
        or base64 photo contents. This results in a 400 response.
    """
    existing = None
    try:
      id_as_long = long(photo_request.key)
      existing = cls.get_by_id(id_as_long)
    except (TypeError, ValueError, datastore_errors.Error):
      raise endpoints.BadRequestException(cls.KEY_WRONG_FORMAT)

    if existing is None:
      raise endpoints.NotFoundException(cls.NOT_FOUND_ERROR)

    # Make it so that RequireOwner "knows" this entity came from the datastore
    # This is again dealing with the fact that we don't have the full use of
    # the EndpointsModel behavior.
    existing._from_datastore = True
    PicturesqueUser.RequireOwner(existing)

    if photo_request.title is None:
      raise endpoints.BadRequestException(cls.TITLE_NEEDED)
    if photo_request.base64Photo is None:
      raise endpoints.BadRequestException(cls.PHOTO_NEEDED)
    if photo_request.mimeType is None:
      raise endpoints.BadRequestException(cls.MIME_TYPE_NEEDED)

    # Remove the key so UpdateFromKey in Photo.KeySet doesn't get called when
    # EndpointsModel.FromMessage is called.
    photo_request.key = None
    photo = cls.FromMessage(photo_request)
    # Set datastore key explicitly instead of 'key' since that would call KeySet
    photo._key = existing._key
    # Set owner since it would be set in PhotoInsert and can't come in from
    # the payload, only through auth
    photo.owner = existing.owner
    # Set ACL since we don't allow it in the Schema for Update
    photo.acl = existing.acl

    photo.put()
    return photo
