# Picturesque

"Picturesque" is a sample application used to demonstrate Cloud and Client
best practices at [Google I/O 2013][23]. For more information, see the
[slides][13], the [Google I/O Session][14] or try out the [application][15]!

## Project Setup, Installation, and Configuration

To check out the application, execute:
```
git clone --recursive https://github.com/GoogleCloudPlatform/appengine-picturesque-python
```
and all submodules will be cloned as well.

To set up the application, you'll need to create a `settings.py` file with
your Client ID as well as a `custom-js/picturesque-config.js` file with
the same data. Sample data and links are contained in the files
[`settings.py.example`][24] and
[`custom-js/picturesque-config.js.example`][25].

To build the application after changes, run `python make_index.py` from the
[`html/`][26] directory. This will require that you have [Jinja2][12]
installed locally.

To populate the test data, use the [remote api][22]:

```
remote_api_shell.py -s your-app-id.appspot.com
Email: some-application-admin@mail.com
Password:
App Engine remote_api shell
Python 2.7.2 (default, Oct 11 2012, 20:14:37)
[GCC 4.2.1 Compatible Apple Clang 4.0 (tags/Apple/clang-418.0.60)]
The db, ndb, users, urlfetch, and memcache modules are imported.
s~your-app-id> import populate_test_user
s~your-app-id> populate_test_user.reset_test_user()
Removing all existing
Adding the demo photos
s~your-app-id>
```

where `your-app-id` is the application ID you are using in `app.yaml`. This
will also use the test user account you define in `settings.py`.

## Contributing changes

*  See [`CONTRIB.md`][28].

## Licensing

*  See [`LICENSE`][27].
*  **Note**: We use other libraries packaged with our application that
   are under different license:
   *  Twitter Bootstrap [License][17]
   *  jQuery [License][21]
   *  jQuery Mobile [License][18]
   *  `filer.js` [License][19]
   *  Lawnchair [License][20]

## Products
- [App Engine][9]

## Language
- [Python][5]

## APIs
- [NDB Datastore API][6]
- [Deferred Libary][7]
- [Remote API][22]
- [Datastore Transactions][8]
- [Google Cloud Endpoints][10]
- [`endpoints-proto-datastore`][11]

## Dependencies
- [jQuery][1]
- [jQuery Mobile][2]
- [`filer.js`][3]
- [Lawnchair.js][4]
- [Jinja2][12]
- [Twitter Bootstrap][16]


[1]: http://jquery.com/
[2]: http://jquerymobile.com/
[3]: https://github.com/ebidel/filer.js
[4]: http://brian.io/lawnchair/
[5]: https://python.org
[6]: https://developers.google.com/appengine/docs/python/ndb/
[7]: https://developers.google.com/appengine/articles/deferred
[8]: https://developers.google.com/appengine/docs/python/datastore/transactions
[9]: https://developers.google.com/appengine
[10]: https://developers.google.com/appengine/docs/python/endpoints
[11]: https://github.com/GoogleCloudPlatform/endpoints-proto-datastore
[12]: http://jinja.pocoo.org/docs/
[13]: https://picturesque-app.appspot.com/slides
[14]: https://developers.google.com/events/io/sessions/333067828
[15]: https://picturesque-app.appspot.com
[16]: http://twitter.github.io/bootstrap/
[17]: https://github.com/twitter/bootstrap/wiki/License
[18]: https://github.com/jquery/jquery-mobile/blob/master/MIT-LICENSE.txt
[19]: https://github.com/ebidel/filer.js/blob/master/LICENSE
[20]: https://github.com/brianleroux/lawnchair/blob/master/LICENSE
[21]: https://github.com/jquery/jquery/blob/master/MIT-LICENSE.txt
[22]: https://developers.google.com/appengine/articles/remote_api
[23]: https://developers.google.com/events/io/2013/
[24]: https://github.com/GoogleCloudPlatform/appengine-picturesque-python/blob/master/settings.py.example
[25]: https://github.com/GoogleCloudPlatform/appengine-picturesque-python/blob/master/custom-js/picturesque-config.js.example
[26]: https://github.com/GoogleCloudPlatform/appengine-picturesque-python/tree/master/html
[27]: https://github.com/GoogleCloudPlatform/appengine-picturesque-python/blob/master/LICENSE
[28]: https://github.com/GoogleCloudPlatform/appengine-picturesque-python/blob/master/CONTRIB.md
