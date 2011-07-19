// Code derived from Chrome sample oAuth/Docs extension;
// http://src.chromium.org/svn/trunk/src/chrome/common/extensions/docs/examples/extensions/gdocs/

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



function sendSignedRequest(url, cb, params){
	params=params||{};
	//params.method= 'GET';
	oauth_sign('gdocs',cb, url, params);
} 
