# Copyright 2013 Google Inc. All Rights Reserved.

"""Simple module to populate data for test user.

This is for demo purposes only; it will destroy existing photos for
the test user and create the default set of new photos.
"""


import base64
import json
import os

from google.appengine.api import users
from google.appengine.ext import ndb

import appengine_config  # For import path mangling
import models
import settings


TEST_USER = users.User(email=settings.TEST_USER_EMAIL,
                       _user_id=settings.TEST_USER_ID)
DEMO_IMAGES_FILE = os.path.join(os.path.dirname(__file__),
                                'demo-images', 'default-items.json')


def remove_all_existing():
  """Removes all existing Photos owned by the test user."""
  existing_query = models.Photo.query(models.Photo.owner == TEST_USER)
  more_results = True
  while more_results:
    keys, _, more_results = existing_query.fetch_page(10, keys_only=True)
    ndb.delete_multi(keys)


def add_demo_photos():
  """Adds the demo photos to the test user account.

  This assumes the test user owns no files and assumes there is an API payload
  corresponding to those items in DEMO_IMAGES_FILE.
  """
  with open(DEMO_IMAGES_FILE, 'r') as fh:
    items = json.load(fh)

  new_photos = []
  for item in items:
    new_photo = models.Photo()
    new_photo.base64_photo = base64.b64decode(item['base64Photo'])
    new_photo.mime_type = item['mimeType']
    new_photo.title = item['title']
    new_photo.owner = TEST_USER
    new_photos.append(new_photo)
  ndb.put_multi(new_photos)


def reset_test_user():
  """Resets test user account with default demo images and nothing else."""
  print 'Removing all existing'
  remove_all_existing()
  print 'Adding the demo photos'
  add_demo_photos()
