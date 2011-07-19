// Code derived from Chrome sample oAuth/Docs extension;
// http://src.chromium.org/svn/trunk/src/chrome/common/extensions/docs/examples/extensions/gdocs/

var util = {};
var gdocs = {};

var docs = []; // In memory cache for the user's entire doclist.
var requestFailureCount = 0;  // used for exponential backoff
var DOCLIST_SCOPE = 'https://docs.google.com/feeds';
var DOCLIST_FEED = DOCLIST_SCOPE + '/default/private/full/';
var DOCLIST_MEDIA = DOCLIST_SCOPE + '/default/media/';
var KEY_DOC = 'ReaderPlus_preferences';
	  
var DEFAULT_MIMETYPES = {
  'atom': 'application/atom+xml',
  'document': 'text/plain',
  'spreadsheet': 'text/csv',
  'presentation': 'text/plain',
  'pdf': 'application/pdf'
};

function syncload(a,cb){
	gdocs.loadStorage(function(googleDocObj, content){
		var a = {};
		try{
			a.prefs = JSON.parse(content);
		}catch(e){
			a=false;
		}
		cb(a);
	});
}
function syncsave(a,cb){
	var content = null;
	try{
		content = JSON.stringify(a.prefs);
	}catch(e){
		
	}
	gdocs.saveStorage(content, cb);
}

gdocs.saveStorage = function(content, cb) {
	gdocs.loadStorage(function(googleDocObj, docContent){
		if(!googleDocObj){
			//create it
			gdocs.createDoc(KEY_DOC, content, false, 'document', cb);
		}else{
			//update
			gdocs.updateDocContent(googleDocObj, content, cb);
		}
	});
};

gdocs.loadStorage = function(cb) {
	gdocs.getDocumentList('', KEY_DOC, function(googleDocObj, content){
		if (googleDocObj){
			var a = {
				onload:true,
				url: googleDocObj.contentSrc + '&exportformat=txt&format=txt'
			};
			request(a,false,function(res){
				cb(googleDocObj, res.responseText);
			});
		}else{
			cb(false, false);
		}		
	});
};

/**
 * Class to compartmentalize properties of a Google document.
 * @param {Object} entry A JSON representation of a DocList atom entry.
 * @constructor
 */
gdocs.GoogleDoc = function(entry) {
  this.entry = entry;
  this.title = entry.title.$t;
  this.resourceId = entry.gd$resourceId.$t;
  this.type = gdocs.getCategory(
    entry.category, 'http://schemas.google.com/g/2005#kind');
  this.starred = gdocs.getCategory(
    entry.category, 'http://schemas.google.com/g/2005/labels',
    'http://schemas.google.com/g/2005/labels#starred') ? true : false;
  this.link = {
    'alternate': gdocs.getLink(entry.link, 'alternate').href
  };
  this.contentSrc = entry.content.src;
};


/**
 * Urlencodes a JSON object of key/value query parameters.
 * @param {Object} parameters Key value pairs representing URL parameters.
 * @return {string} query parameters concatenated together.
 */
util.stringify = function(parameters) {
  var params = [];
  for(var p in parameters) {
    params.push(encodeURIComponent(p) + '=' +
                encodeURIComponent(parameters[p]));
  }
  return params.join('&');
};

/**
 * Creates a JSON object of key/value pairs
 * @param {string} paramStr A string of Url query parmeters.
 *    For example: max-results=5&startindex=2&showfolders=true
 * @return {Object} The query parameters as key/value pairs.
 */
util.unstringify = function(paramStr) {
  var parts = paramStr.split('&');
  var params = {};
  //for (var i = 0; i >= 0; i--){
  for (var i=0,pair; (pair=parts[i]); ++i) {
    var param = pair.split('=');
    params[decodeURIComponent(param[0])] = decodeURIComponent(param[1]);
  }
  return params;
};

/**
 * Returns the correct atom link corresponding to the 'rel' value passed in.
 * @param {Array<Object>} links A list of atom link objects.
 * @param {string} rel The rel value of the link to return. For example: 'next'.
 * @return {string|null} The appropriate link for the 'rel' passed in, or null
 *     if one is not found.
 */
gdocs.getLink = function(links, rel) {
  for (var i = 0, link; (link = links[i]); ++i) {
    if (link.rel === rel) {
      return link;
    }
  }
  return null;
};

/**
 * Returns the correct atom category corresponding to the scheme/term passed in.
 * @param {Array<Object>} categories A list of atom category objects.
 * @param {string} scheme The category's scheme to look up.
 * @param {opt_term?} An optional term value for the category to look up.
 * @return {string|null} The appropriate category, or null if one is not found.
 */
gdocs.getCategory = function(categories, scheme, opt_term) {
  for (var i = 0, cat; (cat = categories[i]); ++i) {
    if (opt_term) {
      if (cat.scheme === scheme && opt_term === cat.term) {
        return cat;
      }
    } else if (cat.scheme === scheme) {
      return cat;
    }
  }
  return null;
};

/**
 * A generic error handler for failed XHR requests.
 * @param {XMLHttpRequest} xhr The xhr request that failed.
 * @param {string} textStatus The server's returned status.
 */
gdocs.handleError = function(xhr, textStatus) {
  ++requestFailureCount;
};

/**
 * A helper for constructing the raw Atom xml send in the body of an HTTP post.
 * @param {XMLHttpRequest} xhr The xhr request that failed.
 * @param {string} docTitle A title for the document.
 * @param {string} docType The type of document to create.
 *     (eg. 'document', 'spreadsheet', etc.)
 * @param {boolean?} opt_starred Whether the document should be starred.
 * @return {string} The Atom xml as a string.
 */
gdocs.constructAtomXml_ = function(docTitle, docType, opt_starred) {
  var starred = opt_starred || null;

  var starCat = ['<category scheme="http://schemas.google.com/g/2005/labels" ',
                 'term="http://schemas.google.com/g/2005/labels#starred" ',
                 'label="starred"/>'].join('');

  var atom = ["<?xml version='1.0' encoding='UTF-8'?>", 
              '<entry xmlns="http://www.w3.org/2005/Atom">',
              '<category scheme="http://schemas.google.com/g/2005#kind"', 
              ' term="http://schemas.google.com/docs/2007#', docType, '"/>',
              starred ? starCat : '',
              '<title>', docTitle, '</title>',
              '</entry>'].join('');
  return atom;
};

/**
 * A helper for constructing the body of a mime-mutlipart HTTP request.
 * @param {string} title A title for the new document.
 * @param {string} docType The type of document to create.
 *     (eg. 'document', 'spreadsheet', etc.)
 * @param {string} body The body of the HTTP request.
 * @param {string} contentType The Content-Type of the (non-Atom) portion of the
 *     http body.
 * @param {boolean?} opt_starred Whether the document should be starred.
 * @return {string} The Atom xml as a string.
 */
gdocs.constructContentBody_ = function(title, docType, body, contentType, opt_starred) {
  var body_ = ['--END_OF_PART\r\n',
              'Content-Type: application/atom+xml;\r\n\r\n',
              gdocs.constructAtomXml_(title, docType, opt_starred), '\r\n',
              '--END_OF_PART\r\n',
              'Content-Type: ', contentType, '\r\n\r\n',
              body, '\r\n',
              '--END_OF_PART--\r\n'].join('');
  return body_;
};
gdocs.constructContent_ = function(body, contentType) {
  var body_ = ['--END_OF_PART\r\n',
              'Content-Type: ', contentType, '\r\n\r\n',
              body, '\r\n',
              '--END_OF_PART--\r\n'].join('');
  return body_;
};

/**
 * Creates a new document in Google Docs.
 * docType= {document,presentation,spreadsheet}
 */
gdocs.createDoc = function(title, content, starred, docType, cb) {
  if (!title) {
    return;
  }

  var handleSuccess = function(googleDocObj, xhr) {
	docs.splice(0, 0, googleDocObj);
    requestFailureCount = 0;
	cb(googleDocObj);
  };

  var params = {
    'method': 'POST',
    'headers': {
      'GData-Version': '3.0',
      'Content-Type': 'multipart/related; boundary=END_OF_PART'
    },
    'parameters': {'alt': 'json'},
    'body': gdocs.constructContentBody_(title, docType, content,
                                        DEFAULT_MIMETYPES[docType], starred)
  };

  // Presentation can only be created from binary content. Instead, create a
  // blank presentation.
  if (docType === 'presentation') {
    params['headers']['Content-Type'] = DEFAULT_MIMETYPES['atom'];
    params['body'] = gdocs.constructAtomXml_(title, docType, starred);
  }

  sendSignedRequest(DOCLIST_FEED, handleSuccess, params);
};


/**
 * Updates a document's metadata (title, starred, etc.).
 * @param {gdocs.GoogleDoc} googleDocObj An object containing the document to
 *     update.
 */
gdocs.updateDocContent = function(googleDocObj, content, cb) {
  var handleSuccess = function(resp, xhr) {
    requestFailureCount = 0;
	if (cb){
		cb(resp);
	}
  };

  var params = {
    'method': 'PUT',
    'headers': {
      'GData-Version': '3.0',
	  'Content-Type': DEFAULT_MIMETYPES[googleDocObj.type.label],
      'If-Match': '*',
	  'Slug':googleDocObj.title
   },
   'parameters': {'alt': 'json'},
    'body': content
  };

  var url = DOCLIST_MEDIA + googleDocObj.resourceId;
  sendSignedRequest(url,  handleSuccess, params);
};

/**
 * Updates a document's metadata (title, starred, etc.).
 * @param {gdocs.GoogleDoc} googleDocObj An object containing the document to
 *     update.
 */
gdocs.updateDoc = function(googleDocObj, cb) {
  var handleSuccess = function(resp) {
    requestFailureCount = 0;
  };

  var params = {
    'method': 'PUT',
    'headers': {
      'GData-Version': '3.0',
      'Content-Type': 'application/atom+xml',
      'If-Match': '*'
    },
    'body': gdocs.constructAtomXml_(googleDocObj.title, googleDocObj.type,
                                    googleDocObj.starred)
  };

  var url = DOCLIST_FEED + googleDocObj.resourceId;
  sendSignedRequest(url,  cb||handleSuccess, params);
};

/**
 * Deletes a document from the user's document list.
 * @param {integer} index An index intro the background page's docs array.
 */
gdocs.deleteDoc = function(index) {
  var handleSuccess = function(resp, xhr) {
    requestFailureCount = 0;
    docs.splice(index, 1);
  };

  var params = {
    'method': 'DELETE',
    'headers': {
      'GData-Version': '3.0',
      'If-Match': '*'
    }
  };

  $('#output li').eq(index).fadeOut('slow');

  sendSignedRequest(
      DOCLIST_FEED + docs[index].resourceId,
      handleSuccess, params);
};

/**
 * Fetches the user's document list.
 * @param {string?} opt_url A url to query the doclist API with. If omitted,
 *     the main doclist feed uri is used.
 */
gdocs.getDocumentList = function(opt_url, title, cb) {
  var url = opt_url || null;

  var params = {
    'headers': {
      'GData-Version': '3.0'
    }
  };

  if (!url) {
    docs = []; // Clear document list. We're doing a refresh.

    url = DOCLIST_FEED;
    params['parameters'] = {
      'alt': 'json',
      'showfolders': 'false',
	  'title-exact': 'false'
    };
	if (title){
		params['parameters']['title']=title.replace(/\s/g, '+');
	}
  } else {
    var parts = url.split('?');
    if (parts.length > 1) {
      url = parts[0]; // Extract base URI. Params are passed in separately.
      params['parameters'] = util.unstringify(parts[1]);
    }
  }

  sendSignedRequest(url, function(r){
  	return gdocs.processDocListResults(r, cb);
  }, params);
};

/**
 * Callback for processing the JSON feed returned by the DocList API.
 * @param {string} response The server's response.
 * @param {XMLHttpRequest} xhr The xhr request that was made.
 */
gdocs.processDocListResults = function(r, cb){
	if (r.status != 200) {
		gdocs.handleError(r, response);
		cb(false, false);
		return;
	} else {
		requestFailureCount = 0;
		var data = r.responseJson;
		if (data.feed.entry) {
			for (var i = 0, entry; (entry = data.feed.entry[i]); ++i) {
				if (entry.title.$t === KEY_DOC) {
					//Use first one only
					var googleDocObj = new gdocs.GoogleDoc(entry);
					cb(googleDocObj);
					return;
				}
			}
		}
	}
	//no one found
	cb(false, false);
};

function sendSignedRequest(url, cb, params){
	params=params||{};
	//params.method= 'GET';
	oauth_sign('gdocs',cb, url, params);
} 
