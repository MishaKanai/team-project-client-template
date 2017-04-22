var database = require('./database.js')

var readDocument = database.readDocument;
var writeDocument = database.writeDocument;
var addDocument = database.addDocument;
var deleteDocument = database.deleteDocument;
var getCollection = database.getCollection;
var resetDatabase = database.resetDatabase;

var validate = require('express-jsonschema').validate;
var bodyParser = require('body-parser');

var express = require('express');
var app = express();

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
    if (userObj.hasOwnProperty('id') && typeof userObj['id'] === 'number') {
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

app.get('/user/:userid/collection', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var collectionOwner = parseInt(req.params.userid, 10);

    if (sender === collectionOwner) {
        var user = readDocument('users', collectionOwner);
        var collections = user.collections.map(
            (cid) => readDocument('collections', cid)
        );
        res.send(collections);
    } else {
        //unauthorized
        res.status(401).end();
    }
});

app.get('/user/:userid/document', function(req, res) {
    var sender = getUserIdFromAuth(req.get('Authorization'));
    var documentOwner = parseInt(req.params.userid, 10);

    if (sender === documentOwner) {
        var user = readDocument('users', documentOwner);
        var documents = user.documents.map(
            (did) => readDocument('documents', did)
        );
        res.send(documents);
    } else {
        //unauthorized
        res.status(401).end();
    }
});


app.use(express.static('../client/build'));

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