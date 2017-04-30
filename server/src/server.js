import path from 'path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { match, RouterContext } from 'react-router';
import routes from '../../client/app/routes';
import NotFoundPage from '../../client/app/components/NotFoundPage';

var UserSettingsSchema = require('../schemas/UserSettings.json');
var DocumentSchema = require('../schemas/Document.json');

var validate = require('express-jsonschema').validate;
var bodyParser = require('body-parser');

var express = require('express');
var app = express();

//mongo express middleware
var mongo_express = require('mongo-express/lib/middleware');
// Import the default Mongo Express configuration
var mongo_express_config = require('mongo-express/config.default.js');

var MongoDB = require('mongodb');
var MongoClient = MongoDB.MongoClient;
var ObjectID = MongoDB.ObjectID;
var url = 'mongodb://localhost:27017/wordsmith';

var ResetDatabase = require('./resetdatabase');

MongoClient.connect(url, function(err, db) {

  app.use('/mongo_express', mongo_express(mongo_express_config));

  app.use(express.static(path.join(__dirname, '../../client/build')));
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../client/build'));

  app.use(bodyParser.text());
  app.use(bodyParser.json());


  function removePasswordSync(userObj) {
    if (userObj.hasOwnProperty('password')) {
      delete userObj['password'];
    }
    return userObj;
  }

  function getUsersResolvedRefsSync(userId) {
    var user = readDocument('users', userId);
    user.collections =
      user.collections.map(
        (cid) => {
          var collection = readDocument('collections', cid);
          collection.documents =
            collection.documents.map(
              (did) => readDocument('documents', did)
            );
          return collection;
        }
      );
    user.documents =
      user.documents.map(
        (did) => readDocument('documents', did)
      );
    return removePasswordSync(user);
  }

  function getUserObjFromAuth(authHeader) {
    try {
      //cut off "bearer " from header
      var token = authHeader.slice(7);
      //convert from base64 to UTF-8
      var plainString = new Buffer(token, 'base64').toString('utf8');
      var tokenObj = JSON.parse(plainString);
      return tokenObj;
    } catch(e) {
      return {} //empty object. error will be caught when object is parsed.
    }
  }

  function getUserIdFromAuth(authHeader) {
    var userObj = getUserObjFromAuth(authHeader);
    if (userObj.hasOwnProperty('id') && typeof userObj['id'] === 'string') {
      //all good
      return userObj['id'];
    } else {
      //signal error
      return -1;
    }
  }

  //stolen from workshop 9
  // Reset database.
  app.post('/resetdb', function(req, res) {
    console.log("Resetting database...");
    // This is a debug route, so don't do any validation.
    database.resetDatabase();
    // res.send() sends an empty response with status code 200
    res.send();
  });

  app.get('/user/:userid/collections', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var collectionOwner = req.params.userid;
    if(sender === collectionOwner){
      readDocument('users', collectionOwner, (err, userData) => {
        if (err) {
          res.status(500).end();
        } else if (userData === null) {
          res.status(404).end();
        } else {
          var query = {
            $or: userData.collections.map((id) => { return {_id: id}})
          };
          db.collection('collections').find(query).toArray(function(err, collections) {
            if (err)
              res.status(500).end();
            res.send(collections);
          });
        }
      });
    } else {
      res.status(401).end();
    }
  });

  app.get('/collection/:collectionid/documents', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var collectionid = req.params.collectionid;
    
    readDocument('users', sender, (err, user) => {
      if (err) {
        res.status(500).end()
      } else if (user === null) {
        res.status(404).end()
      }
      var stringCollections = user.collections.map(function(id) { return id.toString() })
      if (stringCollections.indexOf(collectionid) === -1) {
        res.status(401).end();
      } else {
        readDocument('collections', collectionid, (err, collection) => {
          if (err) {
            res.status(500).end()
          }
          var query = {
            $or: collection.documents.map((id) => {return {_id: id}})
          }
          db.collection('documents').find(query).toArray(function(err, documents) {
            if (err) {
              res.status(500).end()
            }
            res.send(documents)
          })
        });
      }
    });
  });

  app.get('/document/:docid', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var allDocs = [];
    //resolve all documents owned by user
    var user = readDocument('users', sender);
    allDocs = allDocs.concat(user.documents);
    var collDocs = user.collections.map(
      (cid) => readDocument('collections', cid).documents
    );
    collDocs.forEach((docs) => allDocs = allDocs.concat(docs));

    var docid = req.params.docid;
    if (allDocs.indexOf(docid) !== -1) {
      var doc = readDocument('documents', docid);
      res.send(doc);
    } else {
      //figure out which error code to throw
      var documents = getCollection('documents');
      for (var dockey in documents) {
        if (documents[dockey]._id === docid) {
          //resource exists: unauthorized.
          res.status(401).end();
          return;
        }
      }
      //not found
      res.status(404).end();
    }
  });

  function readDocument(collection, id, cb) {
    db.collection(collection).findOne({
      _id: new ObjectID(id)
    }, function(err, data) {
      if (err) {
        return cb(err);
      } else if (data === null) {
        return cb(null, null);
      } else {
        cb(null, data);
      }
    }) 
  }

  function addDocument(collection, data, cb) {
    db.collection(collection).insertOne({ data }, function(err) {
      if (err) {
        cb(err)
      }
      cb(null)
    })
  }

  app.get('/user/:userid', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var userId = req.params.userid;
    if (sender === userId) {
      readDocument('users', userId, (err, userData) => {
        if (err)
          res.status(500).end();
        else if (userData === null) {
          res.status(404).end();
        } else {
          res.send(userData);
        }
      });
    } else {
      //unauthorized
      res.status(401).end();
    }
  });

  app.post('/documents', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    try {
      readDocument('users', sender, (err, user) => {
        if (err) {
          res.status(500).end()
        } else if (user === null) {
          res.status(404).end()
        }
        var doc = {
          "title": req.body.title,
          "text": req.body.text,
          "timestamp": req.body.timestamp
        };
        addDocument('documents', doc, (err) => {
          if (err) {
            res.status(500).end()
          }
          var docId = new ObjectID(doc._id)
          db.collection('users').update({
            _id: new ObjectID(sender)
          }, {
            $addToSet: { 'documents' : docId }
          }, function(err) {
            if (err) {
              res.status(500).end()
            }
            res.send(doc)
          })
        });
      });
    } catch(e) {
      res.status(404).end();
    }
  });

  app.get('/user/:userid/documents', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var userId = req.params.userid;

    if (sender === userId) {

      readDocument('users', userId, (err, userData) => {
        if (err)
          res.status(500).end();
        else if (userData === null) {
          res.status(404).end();
        } else {

          var query = {
            $or: userData.documents.map((id) => { return {_id: id}})
          };
          console.log(query);
          db.collection('documents').find(query).toArray(function(err, documents) {
            if (err)
              res.status(500);
            res.send(documents);
          });
        }
      });


    } else {
      //unauthorized
      res.status(401).end();
    }
  });

  app.post('/collections/:collectionid/documents', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var collectionid = req.params.collectionid;
    //var userId = parseInt(req.body.userId, 10);
    var user = readDocument('users', sender);
    var doc = {
      "title": req.body.title,
      "text": req.body.text,
      "timestamp": req.body.timestamp
    };
    doc = addDocument('documents', doc);
    var coll = readDocument('collections', collectionid);
    coll.documents.push(doc._id);
    writeDocument('collections', coll);
    res.send(doc);

  });


  //Post New Collection
  app.post('/user/:userId/collections', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var userId = req.params.userId;
    if (sender === userId) {
      var user = readDocument('users', sender);
      var coll = {
        "name": req.body.name,
        "documents": []
      };

      coll = addDocument('collections', coll);
      user.collections.push(coll._id);
      writeDocument('users', user);
      res.send(coll);
    } else {
      res.status(401).end();
    }
  });

  //DELETE   /user/:userId/collections/:collectionid
  app.delete('/user/:userId/collections/:collectionid', function(req, res) {

    var sender = getUserIdFromAuth(req.get('Authorization'));
    var collectionid = req.params.collectionid;
    //var userId = parseInt(req.body.userId, 10);

    var user = readDocument('users', sender);
    if (user.collections.indexOf(collectionid) === -1) {
      try {
        readDocument('collections', collectionid);
        res.status(401).end();
      } catch (e) {
        res.status(404).end();
      }
    }

    user.collections = user.collections.filter(val => val!== collectionid);
    writeDocument('users', user);

    deleteDocument('collections', collectionid);
    var remainingDocs = user.collections.map(
      (cid) => readDocument('collections', cid)
    );
    res.send(remainingDocs);
  });


  app.delete('/document/:docId', function(req, res) {

    var sender = getUserIdFromAuth(req.get('Authorization'));
    var docId = req.params.docId;
    //var userId = parseInt(req.body.userId, 10);

    var user = readDocument('users', sender);
    if (user.documents.indexOf(docId) === -1) {
      var userCollections = user.collections.map(
        (cid) => readDocument('collections', cid)
      );
      var collDocuments = userCollections.map((coll) => coll.documents).reduce(
        (a, b) => a.concat(b)
      );
      if (collDocuments.indexOf(docId) !== -1) {
        userCollections.forEach((coll) => {
          var docIndex = coll.documents.indexOf(docId);
          if (docIndex !== -1) {
            coll.documents.splice(docIndex, 1);
            writeDocument('collections', coll);
            res.send(coll.documents.map(
              (did) => readDocument('documents', did)
            ));
          }
        });
      } else {
        try {
          readDocument('documents', docId);
          res.status(401).end();
        } catch (e) {
          res.status(404).end();
        }
      }
    } else {
      user.documents = user.documents.filter(val => val!== docId);
      writeDocument('users', user);

      deleteDocument('documents', docId);
      var remainingDocs = user.documents.map(
        (did) => readDocument('documents', did)
      );
      res.send(remainingDocs);
    }
  });

  app.get('/document/:docid/settings', function(req, res){
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var docid = req.params.docid;
    var doc = readDocument('documents', docid);
    if(doc.hasOwnProperty('settings')){
      res.send(doc.settings)
    }else{
      var user = readDocument('users', sender);
      res.send(user.settings)
    }

  });

  function putUser(userId, settingsId, value, callback) {
    if (settingsId === 'email') {
      db.collection('users').updateOne({ _id: new ObjectID(userId) },
        {
          $set: { 'email' : value }
        }, function(err) {
          if (err) {
            return callback(err)
          }
          return callback(null)
        }
      )
    } else if (settingsId === 'displayName') {
      db.collection('users').updateOne({ _id: new ObjectID(userId) },
        {
          $set: { 'displayName' : value }
        }, function(err) {
          if (err) {
            return callback(err)
          }
          return callback(null)
        }
      )
    } else if (settingsId === 'password') {
      db.collection('users').updateOne({ _id: new ObjectID(userId) },
        {
          $set: { 'password' : value }
        }, function(err) {
          if (err) {
            return callback(err)
          }
          return callback(null)
        }
      )
    } else if (settingsId === 'theme') {
      db.collection('users').updateOne({ _id: new ObjectID(userId) },
        {
          $set: { 'settings.theme' : value }
        }, function(err) {
          if (err) {
            return callback(err)
          }
          return callback(null)
        }
      )
    } else {
      return callback(null)
    }
  }

  app.put('/user/:userid', validate({ body: UserSettingsSchema }), function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var userId = req.params.userid;
    var body = req.body;

    if (sender === userId) {
      putUser(userId, body.settingsId, body.value, (err) => {
        if (err) {
          res.status(500).end()
        } else {
          readDocument('users', userId, (err, user) => {
            if (err) {
              res.status(500).end()
            } else if (user === null) {
              res.status(404).end()
            } else {
              res.send(user)
            }
          })
        }
      })
    } else {
      //unauthorized
      res.status(401).end();
    }
  });

  app.put('/document/:docId', validate({ body: DocumentSchema}), function(req, res) {
    //var sender = getUserIdFromAuth(req.get('Authorization'));
    var docId = req.params.docId;
    var body = req.body;

    db.collection('documents').update({
      _id: new ObjectID(docId)
    }, {
      $set: { 'title' : body.title,
        'text' : body.text,
        'timestamp': body.timestamp
      }
    }, function(err) {
      if (err) {
        res.status(500).end()
      }
      readDocument('documents', docId, (err, doc) => {
        if (err) {
          res.status(500).end()
        } else if (doc === null) {
          res.status(404).end()
        }
        res.send(doc)
      })
    })
  });

  // universal routing and rendering
  app.get('*', (req, res) => {
    match(
      { routes, location: req.url },
      (err, redirectLocation, renderProps) => {

        // in case of error display the error message
        if (err) {
          return res.status(500).send(err.message);
        }

        // in case of redirect propagate the redirect to the browser
        if (redirectLocation) {
          return res.redirect(302, redirectLocation.pathname + redirectLocation.search);
        }

        // generate the React markup for the current route
        let markup;
        if (renderProps) {
          // if the current route matched we have renderProps
          markup = renderToString(<RouterContext {...renderProps}/>);
        } else {
          // otherwise we can render a 404 page
          markup = renderToString(<NotFoundPage/>);
          res.status(404);
        }

        // render the index template with the embedded React markup
        return res.render('index', { markup });
      }
    );
  });

  /**
   * Translate JSON Schema Validation failures into error 400s.
   */
  app.use(function(err, req, res, next) {
    if (err.name === 'JsonSchemaValidation') {
      // Set a bad request http response status
      res.status(400).end();
    } else {
      // It's some other sort of error; pass it to next error middleware handler
      next(err);
    }
  });

  app.listen(3000, function() {
    console.log('Listening on port 3000!');
  });
});
