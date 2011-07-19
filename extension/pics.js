// Code derived from Chrome sample oAuth/Docs extension;
// http://src.chromium.org/svn/trunk/src/chrome/common/extensions/docs/examples/extensions/gdocs/

/**
 * A helper for constructing the raw Atom xml send in the body of an HTTP post.
 * @param {XMLHttpRequest} xhr The xhr request that failed.
 * @param {string} docTitle A title for the document.
 * @param {string} docType The type of document to create.
 *     (eg. 'document', 'spreadsheet', etc.)
 * @param {boolean?} opt_starred Whether the document should be starred.
 * @return {string} The Atom xml as a string.
 */
function constructAtomXml_(docTitle, docType, docSummary) {
  var starred = opt_starred || null;
 
  var starCat = ['<category scheme="http://schemas.google.com/g/2005/labels" ',
                 'term="http://schemas.google.com/g/2005/labels#starred" ',
                 'label="starred"/>'].join('');
 
  var atom = ["<?xml version='1.0' encoding='UTF-8'?>", 
              '<entry xmlns="http://www.w3.org/2005/Atom">',
              '<title>', docTitle, '</title>',
              '<summary>', docSummary, '</summary>',
              '<category scheme="http://schemas.google.com/g/2005#kind"', 
              ' term="http://schemas.google.com/docs/2007#', docType, '"/>',
              starred ? starCat : '',
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
function constructContentBody_(title, docType, body, contentType, opt_starred) {
  var body_ = ['--END_OF_PART\r\n',
              'Content-Type: application/atom+xml;\r\n\r\n',
              gdocs.constructAtomXml_(title, docType, opt_starred), '\r\n',
              '--END_OF_PART\r\n',
              'Content-Type: ', contentType, '\r\n\r\n',
              body, '\r\n',
              '--END_OF_PART--\r\n'].join('');
  return body_;
};

/**
 * Creates a new document in Google Docs.
 * docType= {document,presentation,spreadsheet}
 */
function createDoc(title, content, starred, docType, cb) {
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

  sendSignedRequest(DOCLIST_FEED, handleSuccess, params);
};