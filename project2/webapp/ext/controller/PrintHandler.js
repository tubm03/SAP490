sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
    "use strict";

    /**
     * ===================================================
     * PRINT HANDLER 
     * ===================================================
     * File: webapp/ext/controller/PrintHandler.js
     * Chức năng: Mở PDF trong tab mới để xem/in
     */

    return {
        _downloadHandler: null,
        _lastDownloadTime: 0,

        initialize: function (oController, downloadHandler) {
            this._controller = oController;
            this._downloadHandler = downloadHandler;
            this._interceptODataModel();
            this._setupHTTPInterceptors();
            this._interceptButtons();
        },

        _interceptButtons: function () {
            var that = this;

            setTimeout(function () {
                that._findAndInterceptPrintButtons();
            }, 2000);

            var observer = new MutationObserver(function () {
                that._findAndInterceptPrintButtons();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        _findAndInterceptPrintButtons: function () {
            var that = this;
            var buttons = document.querySelectorAll('button');

            buttons.forEach(function (btn) {
                var text = (btn.textContent || btn.innerText || '').toLowerCase();
                var title = (btn.title || '').toLowerCase();

                if ((text.indexOf('print') > -1 || title.indexOf('print') > -1) &&
                    !btn.dataset.printIntercepted) {

                    btn.dataset.printIntercepted = 'true';

                    btn.addEventListener('click', function (e) {
                        window._printButtonClicked = true;
                        setTimeout(function () {
                            window._printButtonClicked = false;
                        }, 5000);
                    }, true);
                }
            });
        },

        _isCurrentlyDownloading: function () {
            var timeSinceLastDownload = Date.now() - this._lastDownloadTime;
            if (timeSinceLastDownload < 500) {
                return true;
            }

            if (window._isDownloadingFile) {
                this._lastDownloadTime = Date.now();
                return true;
            }

            if (this._downloadHandler && this._downloadHandler.isDownloading &&
                this._downloadHandler.isDownloading()) {
                this._lastDownloadTime = Date.now();
                return true;
            }

            return false;
        },

        _shouldSkipResponse: function (url, responseText) {
            if (this._isCurrentlyDownloading()) {
                return true;
            }

            if (url && (url.indexOf('DownloadFile') > -1 ||
                url.toLowerCase().indexOf('download') > -1)) {
                return true;
            }

            if (responseText && responseText.indexOf('DownloadFile') > -1) {
                return true;
            }

            return false;
        },

        _interceptODataModel: function () {
            try {
                var oModel = this._controller.getView().getModel();
                if (!oModel) return;

                var that = this;

                // Intercept callFunction
                var originalCallFunction = oModel.callFunction;
                if (originalCallFunction) {
                    oModel.callFunction = function (sFunctionName, mParameters) {
                        if (sFunctionName && sFunctionName.toLowerCase().indexOf('print') > -1) {
                            if (mParameters && mParameters.success) {
                                var originalSuccess = mParameters.success;
                                mParameters.success = function (oData, response) {
                                    if (!that._isCurrentlyDownloading()) {
                                        that._handlePrintResponse(oData, response);
                                    }

                                    if (originalSuccess) {
                                        originalSuccess.apply(this, arguments);
                                    }
                                };
                            }
                        }
                        return originalCallFunction.apply(this, arguments);
                    };
                }

                // Intercept bindContext for actions
                var originalBindContext = oModel.bindContext;
                if (originalBindContext) {
                    oModel.bindContext = function (sPath, oContext, mParameters) {
                        var oBinding = originalBindContext.apply(this, arguments);

                        if (sPath && sPath.toLowerCase().indexOf('print') > -1) {
                            var originalExecute = oBinding.execute;
                            if (originalExecute) {
                                oBinding.execute = function () {
                                    return originalExecute.apply(this, arguments)
                                        .then(function (oResult) {
                                            var oBoundContext = oBinding.getBoundContext();
                                            if (oBoundContext) {
                                                var oData = oBoundContext.getObject();
                                                if (!that._isCurrentlyDownloading()) {
                                                    that._handlePrintResponse(oData, null);
                                                }
                                            }
                                            return oResult;
                                        })
                                        .catch(function (oError) {
                                            throw oError;
                                        });
                                };
                            }
                        }

                        return oBinding;
                    };
                }
            } catch (error) {
                // Silent error
            }
        },

        _setupHTTPInterceptors: function () {
            var that = this;

            // Fetch interceptor
            if (typeof window.fetch === "function" && !window.__pdfFetchHooked) {
                var originalFetch = window.fetch;

                window.fetch = function (url, options) {
                    var urlStr = typeof url === "string" ? url : url.url;

                    return originalFetch.apply(this, arguments).then(function (response) {
                        var hasPrint = urlStr && urlStr.toLowerCase().indexOf('print') > -1;
                        var hasDownload = urlStr && (
                            urlStr.toLowerCase().indexOf('download') > -1 ||
                            urlStr.indexOf('DownloadFile') > -1
                        );

                        if (hasPrint && !hasDownload) {
                            var cloned = response.clone();
                            cloned.text().then(function (text) {
                                if (!that._shouldSkipResponse(urlStr, text)) {
                                    that._processPDFResponse(text, urlStr);
                                }
                            }).catch(function (err) {
                                // Silent error
                            });
                        }

                        return response;
                    });
                };

                window.__pdfFetchHooked = true;
            }

            // XHR interceptor
            if (!XMLHttpRequest.prototype.__pdfXHRHooked) {
                var XHROpen = XMLHttpRequest.prototype.open;
                var XHRSend = XMLHttpRequest.prototype.send;

                XMLHttpRequest.prototype.open = function (method, url) {
                    this._url = url;
                    this._isPrintRequest = false;
                    this._isDownloadRequest = false;

                    if (url) {
                        var urlLower = url.toLowerCase();
                        this._isDownloadRequest = urlLower.indexOf('download') > -1 ||
                            url.indexOf('DownloadFile') > -1;
                        this._isPrintRequest = urlLower.indexOf('print') > -1;
                    }

                    return XHROpen.apply(this, arguments);
                };

                XMLHttpRequest.prototype.send = function () {
                    var xhr = this;
                    var url = xhr._url || '';

                    var origStateChange = xhr.onreadystatechange;
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4 && xhr.status === 200) {
                            if (xhr._isDownloadRequest) {
                                if (origStateChange) {
                                    return origStateChange.apply(xhr, arguments);
                                }
                                return;
                            }

                            var responseUrl = xhr.responseURL || url;
                            var responseText = xhr.responseText || '';

                            if (that._shouldSkipResponse(responseUrl, responseText)) {
                                if (origStateChange) {
                                    return origStateChange.apply(xhr, arguments);
                                }
                                return;
                            }

                            // Process BATCH
                            if (responseUrl && responseUrl.indexOf('$batch') > -1) {
                                if (responseText.toLowerCase().indexOf('print') > -1 &&
                                    responseText.length > 50000) {
                                    that._processPDFResponse(responseText, responseUrl);
                                }
                            }

                            // Process PRINT
                            if (xhr._isPrintRequest) {
                                that._processPDFResponse(responseText, responseUrl);
                            }
                        }

                        if (origStateChange) {
                            return origStateChange.apply(xhr, arguments);
                        }
                    };

                    return XHRSend.apply(xhr, arguments);
                };

                XMLHttpRequest.prototype.__pdfXHRHooked = true;
            }
        },

        _handlePrintResponse: function (oData, response) {
            try {
                if (!oData) return;

                var pdfContent = null;
                var fileName = "Document.pdf";

                // Search all possible keys
                var possibleKeys = ['pdfContent', 'PdfContent', 'content', 'Content',
                    'pdf', 'Pdf', 'value', 'Value', 'data', 'Data'];

                for (var i = 0; i < possibleKeys.length; i++) {
                    if (oData[possibleKeys[i]]) {
                        pdfContent = oData[possibleKeys[i]];
                        break;
                    }
                }

                // Search nested
                if (!pdfContent) {
                    for (var key in oData) {
                        var value = oData[key];
                        if (typeof value === 'object' && value !== null) {
                            for (var j = 0; j < possibleKeys.length; j++) {
                                if (value[possibleKeys[j]]) {
                                    pdfContent = value[possibleKeys[j]];
                                    break;
                                }
                            }
                        }
                    }
                }

                // Find filename
                fileName = oData.FileName || oData.fileName ||
                    oData.filename || oData.name || fileName;

                if (pdfContent && pdfContent.length > 100) {
                    this.openPDFInNewTab(pdfContent, fileName);
                } else {
                    MessageBox.error("Form content not found in response");
                }
            } catch (error) {
                MessageBox.error("Error processing print response: " + error.message);
            }
        },

        _processPDFResponse: function (responseText, url) {
            try {
                if (this._shouldSkipResponse(url, responseText)) {
                    return;
                }

                // Batch
                if (responseText.indexOf('--batchresponse') > -1 ||
                    responseText.indexOf('Content-Type: multipart/mixed') > -1) {
                    this._parseBatchResponse(responseText);
                    return;
                }

                // JSON
                try {
                    var data = JSON.parse(responseText);
                    this._extractPDFFromJSON(data);
                } catch (e) {
                    if (responseText.indexOf('{') > -1) {
                        this._extractJSONFromText(responseText);
                    }
                }
            } catch (error) {
                // Silent error
            }
        },

        _extractPDFFromJSON: function (data) {
            var pdfContent = null;
            var fileName = "Document.pdf";

            if (data.value && Array.isArray(data.value) && data.value.length > 0) {
                var item = data.value[0];
                pdfContent = item.pdfContent || item.PdfContent || item.content ||
                    item.pdf || item.Pdf || item.value;
                fileName = item.FileName || item.fileName || fileName;
            } else {
                pdfContent = data.pdfContent || data.PdfContent || data.content ||
                    data.pdf || data.Pdf || data.value;
                fileName = data.FileName || data.fileName || fileName;
            }

            if (pdfContent && pdfContent.length > 1000) {
                this.openPDFInNewTab(pdfContent, fileName);
            } else {
                this._extractPDFFromData(data);
            }
        },

        _parseBatchResponse: function (batchText) {
            try {
                if (batchText.indexOf('DownloadFile') > -1) {
                    return;
                }

                var boundaryMatch = batchText.match(/--[\w-]+/);
                var boundary = boundaryMatch ? boundaryMatch[0] : null;

                if (boundary) {
                    var parts = batchText.split(boundary);

                    for (var i = 0; i < parts.length; i++) {
                        var part = parts[i].trim();
                        if (part.length < 100) continue;

                        if (part.indexOf('application/json') > -1 || part.indexOf('{') > -1) {
                            var jsonStart = part.indexOf('{');
                            if (jsonStart > -1) {
                                var jsonText = part.substring(jsonStart);
                                var braceCount = 0;
                                var jsonEnd = -1;

                                for (var j = 0; j < jsonText.length; j++) {
                                    if (jsonText[j] === '{') braceCount++;
                                    if (jsonText[j] === '}') {
                                        braceCount--;
                                        if (braceCount === 0) {
                                            jsonEnd = j + 1;
                                            break;
                                        }
                                    }
                                }

                                if (jsonEnd > 0) {
                                    var jsonString = jsonText.substring(0, jsonEnd);
                                    try {
                                        var json = JSON.parse(jsonString);
                                        this._extractPDFFromData(json);
                                    } catch (parseErr) {
                                        // Silent error
                                    }
                                }
                            }
                        }
                    }
                } else {
                    this._extractJSONFromText(batchText);
                }
            } catch (error) {
                // Silent error
            }
        },

        _extractJSONFromText: function (text) {
            try {
                var jsonRegex = /\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;
                var matches = text.match(jsonRegex);

                if (matches) {
                    for (var i = 0; i < matches.length; i++) {
                        try {
                            var obj = JSON.parse(matches[i]);
                            this._extractPDFFromData(obj);
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            } catch (error) {
                // Silent error
            }
        },

        _extractPDFFromData: function (data) {
            if (data && (data.FileName || data.fileName)) {
                var fileName = data.FileName || data.fileName || '';
                if (fileName && !fileName.toLowerCase().endsWith('.pdf')) {
                    return;
                }
            }

            var pdfContent = null;
            var fileName = "Document.pdf";

            for (var key in data) {
                var value = data[key];
                var keyLower = key.toLowerCase();

                if (keyLower.indexOf('pdf') > -1 ||
                    keyLower.indexOf('print') > -1 ||
                    (keyLower.indexOf('content') > -1 && keyLower.indexOf('file') === -1)) {

                    if (typeof value === "string" && value.length > 1000) {
                        var cleanValue = value.replace(/\s/g, '');
                        if (cleanValue.match(/^[A-Za-z0-9+/=]+$/)) {
                            pdfContent = cleanValue;
                            break;
                        }
                    }
                }
            }

            if (data.FileName || data.fileName) {
                fileName = data.FileName || data.fileName;
            }

            if (pdfContent) {
                this.openPDFInNewTab(pdfContent, fileName);
            }
        },

        /**
         * ===================================================
         * PUBLIC METHOD: Open PDF in new tab
         * ===================================================
         */
        openPDFInNewTab: function (base64Content, fileName) {
            try {
                var cleanBase64 = base64Content.replace(/\s/g, '');

                if (cleanBase64.indexOf('data:') === 0) {
                    cleanBase64 = cleanBase64.split(',')[1];
                }

                var binary = atob(cleanBase64);
                var bytes = new Uint8Array(binary.length);
                for (var i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }

                var blob = new Blob([bytes], { type: 'application/pdf' });
                var url = URL.createObjectURL(blob);

                var win = window.open(url, '_blank');

                if (!win) {
                    MessageBox.warning("Popup blocked. Please allow popup and try again.", {
                        actions: [MessageBox.Action.OK],
                        onClose: function () {
                            this._fallbackToDownload(base64Content, fileName);
                        }.bind(this)
                    });
                } else {
                    MessageToast.show("Form opened in new tab");
                }

                setTimeout(function () {
                    URL.revokeObjectURL(url);
                }, 60000);

            } catch (error) {
                MessageBox.error("Cannot open file: " + error.message);
            }
        },

        _fallbackToDownload: function (base64Content, fileName) {
            try {
                var cleanBase64 = base64Content.replace(/\s/g, '');
                if (cleanBase64.indexOf('data:') === 0) {
                    cleanBase64 = cleanBase64.split(',')[1];
                }

                var binaryString = atob(cleanBase64);
                var bytes = new Uint8Array(binaryString.length);

                for (var i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                var blob = new Blob([bytes], { type: 'application/pdf' });
                var url = URL.createObjectURL(blob);
                var link = document.createElement('a');

                link.href = url;
                link.download = fileName;
                link.style.display = 'none';

                document.body.appendChild(link);
                link.click();

                setTimeout(function () {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 100);

                MessageToast.show("File downloaded: " + fileName);
            } catch (error) {
                MessageBox.error("Cannot download file");
            }
        }
    };
});