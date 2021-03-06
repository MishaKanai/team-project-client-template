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

var PythonShell = require('python-shell');

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

    app.get('/urbanapi/:word', function(req,res){
        var word = req.params.word;

        var options = {
            pythonPath: 'py/venv/bin/python',
            args: [word]
        };
        PythonShell.run('py/urban.py', options , function (err, results) {
            if (err) {
                console.log(err);
                res.status(500).end();
            }
            else {
                console.log(results[0]);
                res.send(results[0]);
            }
        });

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
                console.log("error1", err);
                res.status(500).end()
            } else if (user === null) {
                res.status(404).end()
            } else {
                var stringCollections = user.collections.map(function(id) { return id.toString() })
                if (stringCollections.indexOf(collectionid) === -1) {
                    res.status(401).end();
                } else {
                    readDocument('collections', collectionid, (err, collection) => {
                        if (err) {
                            console.log("error2", err);
                            res.status(500).end();
                        } else if (collection === null) {
                            res.status(404).end();
                        } else if (collection.documents.length > 0) {
                            var query = {
                                $or: collection.documents.map((id) => {return {_id: id}})
                            }
                            db.collection('documents').find(query).toArray(function(err, documents) {
                                if (err) {
                                    console.log("error3", err);
                                    res.status(500).end()
                                }
                                res.send(documents)
                            });
                        } else {
                            res.send([]);
                        }
                    });
                }
            }
        });
    });

    app.get('/document/:docid', function(req, res) {
        var sender = getUserIdFromAuth(req.get('Authorization'));
        var allDocs = [];
        //resolve all documents owned by user
        readDocument('users', sender, (err, userData) => {
            if (err)
                res.status(500).end();
            else {
                console.log(userData);
                allDocs = allDocs.concat(userData.documents);

                //query to get resolved collection documents
                var query = {
                    $or: userData.collections.map((id) => {return {_id: id}})
                }
                //find all documents owned under collections.
                db.collection('collections').find(query).toArray((err, collections) => {
                    if (err)
                        res.status(500).end();
                    else {
                        //append collection documents to list of all documents
                        collections.forEach((coll) => allDocs = allDocs.concat(coll.documents));
                        var docid = req.params.docid;
                        console.log(allDocs);
                        console.log(docid);
                        //since indexOf does not work on objects:
                        var userOwnsDoc = false;
                        allDocs.forEach((objID) => {
                            if (objID.valueOf() == docid.valueOf())
                                userOwnsDoc = true;
                        });

                        if (userOwnsDoc) {
                            //if document is found, return it!
                            var doc = readDocument('documents', docid.valueOf(), (err, doc) => {
                                if (!err) {
                                    res.send(doc);
                                }
                                else
                                    res.status(500).end();
                            });
                        } else {
                            //figure out which error code to throw
                            var found = false;
                            var cursor = db.collection('documents').find();
                            cursor.each(function(err, doc) {
                                if (!err && doc !== null && doc._id.valueOf() == docid.valueOf()) {
                                    //resource exists: unauthorized
                                    res.status(401).end();
                                    found = true;
                                } else if (err) {
                                    res.status(500).end();
                                } else if (!doc) {
                                    //not found
                                    res.status(404).end();
                                }
                            });
                        }
                    }
                });
            }
        });


    });

    function readDocument(collection, id, cb) {
        db.collection(collection).findOne({
            _id: new ObjectID(id)
        }, function(err, data) {
            if (err) {
                cb(err);
            } else if (data === null) {
                cb(null, null);
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
        var collectionid = req.params.collectionid;

        //add this later
        //var time = new Date().getTime();

        var doc = {
            "title": req.body.title,
            "text": req.body.text,
            "timestamp": req.body.timestamp //replace with time
        };

        db.collection('documents').insertOne(doc, function(err, result) {
            if (err)
                res.status(500).end();

            doc._id = result.insertedId;
            db.collection('users').updateOne(
                { _id: new ObjectID(sender) },
                {
                    $addToSet: {
                        documents: doc._id
                    }
                }, function(err) {
                    if (err) {
                        res.status(500).end()
                    }
                    res.send(doc);
                })
        });
    });

    app.get('/user/:userid/documents', function(req, res) {
        var sender = getUserIdFromAuth(req.get('Authorization'));
        var userId = req.params.userid;

        console.log(sender);
        console.log(userId);
        if (sender === userId) {

            readDocument('users', userId, (err, userData) => {
                if (err)
                    res.status(500).end();
                else if (userData === null) {
                    res.status(404).end();
                } else {
                    if (userData.documents.length > 0) {
                        var query = {
                            $or: userData.documents.map((id) => { return {_id: id}})
                        };
                        console.log(query);
                        db.collection('documents').find(query).toArray(function(err, documents) {
                            if (err) {
                                console.log(err);
                                res.status(500);
                            }
                            res.send(documents);
                        });
                    } else {
                        res.send([]);
                    }
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

        //add this later
        //var time = new Date().getTime();

        var doc = {
            "title": req.body.title,
            "text": req.body.text,
            "timestamp": req.body.timestamp //replace with time
        };

        db.collection('documents').insertOne(doc, function(err, result) {
            if (err)
                res.status(500).end();

            doc._id = result.insertedId;
            db.collection('collections').updateOne(
                { _id: new ObjectID(collectionid) },
                {
                    $addToSet: {
                        documents: doc._id
                    }
                }, function(err) {
                    if (err) {
                        console.log("error", err);
                        res.status(500).end()
                    }
                    res.send(doc);
                })
        });
    });


    //Post New Collection
    app.post('/user/:userId/collections', function(req, res) {
        var sender = getUserIdFromAuth(req.get('Authorization'));
        var collectionid = req.params.collectionid;

        var collection = {
            "name": req.body.name,
            "documents": []
        };

        db.collection('collections').insertOne(collection, function(err, result) {
            if (err) {
                res.status(500).end();
            } else {
                collection._id = result.insertedId;
                db.collection('users').updateOne(
                    { _id: new ObjectID(sender) },
                    {
                        $addToSet: {
                            collections: collection._id
                        }
                    }, function(err) {
                        if (err) {
                            res.status(500).end()
                        }
                        res.send(collection);
                    })
            }
        });

    });

    app.delete('/document/:docid', function(req, res) {
        var sender = getUserIdFromAuth(req.get('Authorization'));
        var docId = new ObjectID(req.params.docid);
        var allDocs = [];
        //resolve all documents owned by user
        readDocument('users', sender, (err, userData) => {
            if (err)
                res.status(500).end();
            else {
                var indexOfDoc = -1;
                userData.documents.forEach((objID) => {
                    if (objID.toString() === docId.toString())
                        indexOfDoc++;
                });
                if (indexOfDoc !== -1) { //document FOUND: owned by user.
                    console.log("A");
                    db.collection('documents').deleteOne(
                        { _id : docId },
                        function(err, results) {
                            if (err || results === null) {
                                //should not be null-
                                //we already verified presence of the document
                                res.status(500).end();
                            }else {
                                // DELETE FROM USER's data
                                db.collection('users').updateOne(
                                    { _id: new ObjectID(sender) },
                                    {
                                        $pull: { documents: docId}

                                    }, function(err) {
                                        if (err) {
                                            res.status(500).end()
                                        }
                                        //SEND RESOLVED USER DOCUMENTS
                                        db.collection('users').findOne({
                                            _id: new ObjectID(sender)
                                        }, function(err, userData) {
                                            if (err)
                                                res.status(500).end();
                                            else if (userData === null) {
                                                res.status(404).end();
                                            } else {
                                                if (userData.documents.length > 0) {
                                                    var query = {
                                                        $or: userData.documents.map((id) => { return {_id: id}})
                                                    };
                                                    console.log(query);
                                                    db.collection('documents').find(query).toArray(function(err, documents) {
                                                        if (err)
                                                            res.status(500);
                                                        res.send(documents);
                                                    });
                                                } else {
                                                    res.send([]);
                                                }
                                            }
                                        })
                                    });
                            }
                        }
                    );
                } else {
                    //DOCUMENT NOT FOUND: check if owned by collection
                    var query = {
                        $or: userData.collections.map((id) => {return {_id: id}})
                    }
                    //find all documents owned under collections.
                    db.collection('collections').find(query).toArray((err, collections) => {
                        if (err)
                            res.status(500).end();
                        else {
                            var collDocs = [];
                            //append collection documents to list of all documents
                            collections.forEach((coll) => {
                                collDocs = collDocs.concat(coll.documents.map((doc) => {
                                    return {
                                        docID: doc,
                                        collID: coll._id
                                    }
                                }));
                            });
                            console.log(collDocs);

                            //since indexOf does not work on objects:
                            indexOfDoc = -1;
                            for (var i=0; i<collDocs.length; i++) {
                                if (collDocs[i].docID.str === docId.str)
                                    indexOfDoc = i;
                            }

                            if (indexOfDoc !== -1) {
                                //document found. DELETE IT
                                db.collection('documents').deleteOne(
                                    { _id : docId },
                                    function(err, results) {
                                        if (err || results === null)
                                            res.status(500).end();
                                        else {
                                            //SEND RESOLVED USER DOCUMENTS
                                            console.log(collDocs[indexOfDoc].docID);
                                            console.log(typeof collDocs[indexOfDoc].docID);
                                            db.collection('collections').findOne({
                                                _id: collDocs[indexOfDoc].collID
                                            }, function(err, collData) {
                                                if (err)
                                                    res.status(500).end();
                                                else if (collData === null) {
                                                    res.status(404).end();
                                                } else {
                                                    var query = {
                                                        $or: collData.documents.map((id) => { return {_id: id}})
                                                    };
                                                    console.log(query);
                                                    db.collection('documents').find(query).toArray(function(err, documents) {
                                                        if (err)
                                                            res.status(500);
                                                        res.send(documents);
                                                    });
                                                }
                                            })
                                        }
                                    }
                                );
                            } else {
                                //figure out which error code to throw
                                //for now just send 404
                                res.status(404).end();
                            }
                        }
                    });
                }
            }
        });
    });

    //DELETE   /user/:userId/collections/:collectionid
    app.delete('/user/:userid/collections/:collectionid', function(req, res) {

        var sender = getUserIdFromAuth(req.get('Authorization'));
        var collectionOwner = req.params.userid;
        var collectionId = new ObjectID(req.params.collectionid);
        if(sender === collectionOwner){

            readDocument('users', collectionOwner, (err, userData) => {
                if (err) {
                    res.status(500).end();
                } else if (userData === null) {
                    res.status(404).end();
                } else {
                    db.collection('collections').findOne({
                        _id: collectionId
                    }, function (err, collectionData) {
                        if (err) {
                            res.status(500).end();
                        } else if (collectionData === null){
                            //not found
                            res.status(404).end();
                        } else {
                            //collection exists:
                            //check if user OWNS the collection
                            var userOwnsColl = false;
                            userData.collections.forEach((objID) => {
                                if (objID.str == collectionId.str)
                                    userOwnsColl = true;
                            });

                            if (!userOwnsColl) {
                                //user does NOT own the collection
                                res.status(401).end();
                            } else {
                                //user owns the collection, and collection is found.
                                //ALL CLEAR TO DELETE

                                db.collection('collections').deleteOne(
                                    { _id : collectionId },
                                    function(err, results) {
                                        if (err || results === null) {
                                            //should not be null-
                                            //we already verified presence of the collection
                                            res.status(500).end();
                                        }else {
                                            if (collectionData.documents.length > 0) {
                                                var docQuery = {
                                                    $or: collectionData.documents.map(
                                                        (id) => { return {_id: id} }
                                                    )
                                                };
                                                db.collection('documents').deleteMany(
                                                    docQuery,
                                                    function(err, numberdeleted) {
                                                        if (err)
                                                            res.status(500).end();
                                                        else {
                                                            //SEND BACK COLLECTIONS
                                                            var query = {
                                                                $or: userData.collections.map((id) => { return {_id: id}})
                                                            };
                                                            db.collection('collections').find(query).toArray(function(err, collections) {
                                                                if (err)
                                                                    res.status(500).end();
                                                                res.send(collections);
                                                            });
                                                        }

                                                    }
                                                );
                                            } else {
                                                res.send([]);
                                            }
                                        }
                                    }
                                );

                            }
                        }

                    })
                }
            });
        } else {
            res.status(401).end();
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
