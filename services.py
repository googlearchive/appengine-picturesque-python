# Copyright 2013 Google Inc. All Rights Reserved.

"""Services module for creating an Endpoints API server."""


from google.appengine.ext import endpoints

import picturesque


api_list = [
    picturesque.PicturesqueApi,
]
application = endpoints.api_server(api_list, restricted=False)
