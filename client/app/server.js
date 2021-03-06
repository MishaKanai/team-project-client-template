export function getCollections(userId, cb) {
    sendXHR('GET', '/user/'+userId+'/collections', undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
}

export function getUserDocuments(userId, cb) {
    sendXHR('GET', '/user/'+userId+'/documents', undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
}

/*
export function getMostRecentUserDocument(userId) {
    var user = readDocument('users', userId);
    var mostRecentdocument = user.documents[user.documents.length-1]
    emulateServerReturn(mostRecentdocument);
}*/

export function getCollectionDocuments(collectionId, cb) {
    sendXHR('GET', '/collection/'+collectionId+'/documents', undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
}

export function getDocument(docId, cb) {
    sendXHR('GET', '/document/'+docId, undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
}

export function getUserSettings(userId, cb) {
    sendXHR('GET', '/user/'+userId, undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
}

//falls back to user settings if document settings not set
export function getDocumentSettings(userId, docId, cb) {
    // var doc = readDocument('documents', docId);
    // var settings;
    // if (doc.hasOwnProperty('settings'))
    //     settings = doc.settings;
    // else
    //     settings = readDocument('users', userId).settings;
    // emulateServerReturn(settings, cb);
    sendXHR('GET', '/document/'+docId+'/settings', undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
}



// POST functions
export function postUser(username, email, displayName, password, cb) {
    var newUser = {
        "username": username,
        "email": email,
        "displayName": displayName,
        "password": password,
        "settings": {
            //default settings
            "theme": "WordSmith"
        },
        "collections": [],
        "documents": []
    };
    sendXHR('POST', '/users', newUser, (xhr) => {
      // Return the new status update.
      cb(JSON.parse(xhr.responseText));
    })
    //newUser = removePasswordSync(addDocument('users', newUser));
    //emulateServerReturn(newUser, cb);
}

export function postDocumentToUser(userId, title, text, timestamp, cb) {
  sendXHR('POST', '/documents', {
      userId: userId,
      title: title,
      text: text,
      timestamp: timestamp
    }, (xhr) => {
      cb(JSON.parse(xhr.responseText));
    });
}


export function postDocumentToCollection(collId, title, text, timestamp, cb) {
  sendXHR('POST', '/collections/'+collId+'/documents', {
      title: title,
      text: text,
      timestamp: timestamp
    }, (xhr) => {
      cb(JSON.parse(xhr.responseText));
    });
}

export function postCollection(userId, collectionName, cb) {
 sendXHR('POST', '/user/'+userId+'/collections', {
     name: collectionName
   }, (xhr) => {
     cb(JSON.parse(xhr.responseText));
   });
}


//PUT functions
export function putDocument(docId, title, text, timestamp, cb) {
    // var document = readDocument('documents', docId);
    // document.title = title;
    // document.text = text;
    // document.timestamp = timestamp;
    // writeDocument('documents', document)
    // emulateServerReturn(document, cb);
    sendXHR('PUT', '/document/'+docId, {
      title: title,
      text: text,
      timestamp: timestamp
    }, (xhr) => {
      cb(JSON.parse(xhr.responseText));
    })
}

export function putUserSettings(userId, settingsId, value, cb) {
    sendXHR('PUT', '/user/'+userId, {
        settingsId: settingsId,
        value: value
    }, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
}


/* DELETE */

export function deleteUserDocument(userId, docId, cb) {
    sendXHR('DELETE', '/document/'+docId, undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
}

export function deleteCollectionDocument(userId, collectionId, docId, cb) {
    sendXHR('DELETE', '/document/'+docId, undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
/*
    sendXHR('DELETE', '/collection/'+collectionId+'/documents/'+docId, undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });

    return emulateServerReturn(remainingDocs, cb);*/
}
///user/:userId/collections/:collId
export function deleteUserCollection(userId,collectionId,cb){
  sendXHR('DELETE','user/'+userId+'/collections/'+collectionId, undefined, (xhr) => {
      cb(JSON.parse(xhr.responseText));
  });
}

export function resetDatabase(cb) {
    sendXHR('POST', 'resetdb', undefined, (xhr) => {
        cb(JSON.parse(xhr.responseText));
    });
}


var token = 'eyJpZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSJ9';

/** TAKEN FROM WORKSHOP 9
 * Properly configure+send an XMLHttpRequest with error handling,
 * authorization token, and other needed properties.
 */
function sendXHR(verb, resource, body, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open(verb, resource);
  xhr.setRequestHeader('Authorization', 'Bearer ' + token);

  // The below comment tells ESLint that WordSmithError is a global.
  /* global WordSmithError */

  // Response received from server. It could be a failure, though!
  xhr.addEventListener('load', function() {
    var statusCode = xhr.status;
    var statusText = xhr.statusText;
    if (statusCode >= 200 && statusCode < 300) {
        //success
      cb(xhr);
    } else {
      var responseText = xhr.responseText;
      WordSmithError('Could not ' + verb + " " + resource + ": Received " +
		            statusCode + " " + statusText + ": " + responseText);
    }
  });

  // Time out the request if it takes longer than 10,000
  // milliseconds (10 seconds)
  xhr.timeout = 10000;

  // Network failure: Could not connect to server.
    xhr.addEventListener('error', function(e) {
        console.log(e);
    WordSmithError('Could not ' + verb + " " + resource +
	              ": Could not connect to the server.");
  });

  // Network failure: request took too long to complete.
  xhr.addEventListener('timeout', function() {
    WordSmithError('Could not ' + verb + " " + resource +
		          ": Request timed out.");
  });

  switch (typeof(body)) {
    case 'undefined':
      // No body to send.
      xhr.send();
      break;
    case 'string':
      // Tell the server we are sending text.
      xhr.setRequestHeader("Content-Type", "text/plain;charset=UTF-8");
      xhr.send(body);
      break;
    case 'object':
      // Tell the server we are sending JSON.
      xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
      // Convert body into a JSON string.
      xhr.send(JSON.stringify(body));
      break;
    default:
      throw new Error('Unknown body type: ' + typeof(body));
  }
}
