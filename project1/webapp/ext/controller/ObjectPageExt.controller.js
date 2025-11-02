sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (ControllerExtension, MessageToast, MessageBox) {
    "use strict";

    return ControllerExtension.extend("project1.ext.controller.ObjectPageExt", {

        override: {
            onInit: function () {
                if (this.base && this.base.onInit) {
                    this.base.onInit.apply(this, arguments);
                }

                setTimeout(function () {
                    this._initializePDFHandler();
                    this._initializeDownloadHandler();
                    this._setupTableEventHandlers();
                }.bind(this), 500);
            },

            onAfterRendering: function () {
                if (this.base && this.base.onAfterRendering) {
                    this.base.onAfterRendering.apply(this, arguments);
                }

                setTimeout(function () {
                    this._hookPrintButton();
                    this._hookDownloadButton();
                    this._attachDownloadButtonHandler();
                }.bind(this), 1000);
            }
        },

        //===================================================
        // XỬ LÝ DOWNLOAD FILE CV (CHỈ DOWNLOAD, KHÔNG MỞ TAB)
        //===================================================
        _initializeDownloadHandler: function () {
            console.log("Initializing download handler...");
            this._setupDownloadInterceptors();
        },

        _setupDownloadInterceptors: function () {
            var that = this;

            try {
                var oModel = this.base.getView().getModel();
                if (!oModel) {
                    console.error("Model not found");
                    return;
                }

                var originalBindContext = oModel.bindContext;
                if (originalBindContext) {
                    oModel.bindContext = function (sPath, oContext, mParameters) {
                        var oBinding = originalBindContext.apply(this, arguments);

                        if (sPath && sPath.indexOf('DownloadFile') > -1) {
                            console.log("DownloadFile action detected:", sPath);

                            var originalExecute = oBinding.execute;
                            if (originalExecute) {
                                oBinding.execute = function () {
                                    console.log("Executing DownloadFile action...");

                                    return originalExecute.apply(this, arguments)
                                        .then(function (oContext) {
                                            console.log("Download action completed", oContext);
                                            that._handleDownloadResponse(oBinding, oContext);
                                            return oContext;
                                        })
                                        .catch(function (oError) {
                                            console.error("Download action failed:", oError);
                                            MessageBox.error("Download failed: " + (oError.message || "Unknown error"));
                                            throw oError;
                                        });
                                };
                            }
                        }

                        return oBinding;
                    };
                    console.log("Download interceptor setup completed");
                }
            } catch (error) {
                console.error("Error setting up download interceptor:", error);
            }
        },

        _setupTableEventHandlers: function () {
            let that = this;
            setTimeout(function () {
                that._attachDownloadButtonHandler();
            }, 1500);
        },

        _attachDownloadButtonHandler: function () {
            let that = this;

            try {
                let oView = this.base.getView();
                let aTables = oView.findAggregatedObjects(true, function (oControl) {
                    return oControl.isA("sap.m.Table");
                });

                console.log("Found tables:", aTables.length);

                aTables.forEach(function (oTable) {
                    let oBinding = oTable.getBinding("items");
                    if (oBinding && oBinding.getPath()) {
                        let sPath = oBinding.getPath();
                        console.log("Table binding path:", sPath);

                        if (sPath.indexOf("_Attachments") > -1 || sPath.indexOf("Attach") > -1) {
                            console.log("Found attachment table");
                            that._hookAttachmentTable(oTable);
                        }
                    }
                });

                that._interceptDownloadButtons();

            } catch (error) {
                console.error("Error attaching download handler:", error);
            }
        },

        _hookAttachmentTable: function (oTable) {
            let that = this;

            let aItems = oTable.getItems();
            aItems.forEach(function (oItem) {
                that._attachItemDownloadHandler(oItem);
            });

            oTable.attachUpdateFinished(function () {
                console.log("Table updated, re-attaching handlers");
                let aNewItems = oTable.getItems();
                aNewItems.forEach(function (oItem) {
                    that._attachItemDownloadHandler(oItem);
                });
            });
        },

        _attachItemDownloadHandler: function (oItem) {
            let that = this;

            if (!oItem.getCells) return;

            oItem.getCells().forEach(function (oCell) {
                if (oCell.isA("sap.m.Button")) {
                    let sText = oCell.getText() || "";
                    let sIcon = oCell.getIcon() || "";

                    if (sText.toLowerCase().indexOf("download") > -1 ||
                        sIcon.indexOf("download") > -1) {

                        console.log("Found download button:", sText || sIcon);

                        oCell.detachPress(that._onDownloadButtonPress, that);
                        oCell.attachPress(that._onDownloadButtonPress, that);
                    }
                }
            });
        },

        _onDownloadButtonPress: function (oEvent) {
            console.log("Download button pressed");

            let oButton = oEvent.getSource();
            let oContext = oButton.getBindingContext();

            if (!oContext) {
                console.error("No context found for download button");
                MessageBox.error("Cannot get attachment context");
                return;
            }

            console.log("Context path:", oContext.getPath());
            this._downloadAttachment(oContext);
        },

        _interceptDownloadButtons: function () {
            let that = this;

            let observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1) {
                            let buttons = [];

                            if (node.nodeName === 'BUTTON') {
                                buttons.push(node);
                            } else if (node.querySelectorAll) {
                                buttons = Array.from(node.querySelectorAll('button'));
                            }

                            buttons.forEach(function (btn) {
                                let text = btn.textContent || btn.innerText || '';
                                if (text.toLowerCase().indexOf('download') > -1) {
                                    if (!btn.dataset.downloadHandled) {
                                        btn.dataset.downloadHandled = 'true';
                                        btn.addEventListener('click', function (e) {
                                            that._handleDOMDownloadClick(e, btn);
                                        });
                                    }
                                }
                            });
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        },

        _handleDOMDownloadClick: function (event, button) {
            try {
                let oView = this.base.getView();
                let sControlId = button.id;

                if (sControlId) {
                    let oControl = oView.byId(sControlId) || sap.ui.getCore().byId(sControlId);
                    if (oControl && oControl.getBindingContext) {
                        let oContext = oControl.getBindingContext();
                        if (oContext) {
                            event.preventDefault();
                            event.stopPropagation();
                            this._downloadAttachment(oContext);
                            return;
                        }
                    }
                }

                let row = button.closest('tr');
                if (row && row.id) {
                    let oRowControl = sap.ui.getCore().byId(row.id);
                    if (oRowControl && oRowControl.getBindingContext) {
                        let oContext = oRowControl.getBindingContext();
                        if (oContext) {
                            event.preventDefault();
                            event.stopPropagation();
                            this._downloadAttachment(oContext);
                        }
                    }
                }
            } catch (error) {
                console.error("Error handling DOM download click:", error);
            }
        },

        _downloadAttachment: function (oContext) {
            if (!oContext) {
                MessageBox.error("Không thể lấy thông tin file đính kèm");
                return;
            }

            console.log("=== BẮT ĐẦU DOWNLOAD FILE ===");

            let oData = oContext.getObject();
            console.log("1. Context data:", oData);

            let oModel = oContext.getModel();
            let sPath = oContext.getPath();

            console.log("2. Context path:", sPath);

            let sCleanPath = sPath.endsWith('/') ? sPath.slice(0, -1) : sPath;
            let sActionPath = sCleanPath + "/z4i_appr_attach.DownloadFile(...)";

            console.log("3. Action path:", sActionPath);

            MessageToast.show("Đang chuẩn bị tải xuống...");

            let oOperation = oModel.bindContext(sActionPath);

            oOperation.execute()
                .then(function () {
                    console.log("4. Action executed successfully");

                    return new Promise(function (resolve) {
                        setTimeout(function () {
                            resolve(oOperation);
                        }, 100);
                    });
                })
                .then(function (oOperation) {
                    let oBoundContext = oOperation.getBoundContext();
                    console.log("5. Bound context:", oBoundContext);

                    if (!oBoundContext) {
                        throw new Error("Không nhận được bound context từ action");
                    }

                    let oResult = oBoundContext.getObject();
                    console.log("6. Result object:", oResult);

                    if (!oResult) {
                        throw new Error("Không có dữ liệu trong result");
                    }

                    let fileContent = oResult.FileContent ||
                        oResult.fileContent ||
                        oResult.filecontent ||
                        oResult.Content ||
                        oResult.content;

                    let fileName = oResult.FileName ||
                        oResult.fileName ||
                        oData.FileName ||
                        "download.pdf";

                    let mimeType = oResult.MimeType ||
                        oResult.mimeType ||
                        oData.MimeType ||
                        "application/pdf";

                    console.log("7. Extracted data:", {
                        fileName: fileName,
                        mimeType: mimeType,
                        hasContent: !!fileContent,
                        contentLength: fileContent ? fileContent.length : 0
                    });

                    if (!fileContent) {
                        console.error("8. KHÔNG CÓ FILE CONTENT!");
                        console.error("Available keys in result:", Object.keys(oResult));
                        throw new Error("Không có nội dung file trong response");
                    }

                    console.log("9. Bắt đầu download file...");
                    // GỌI METHOD DOWNLOAD FILE RIÊNG
                    this._performFileDownload(fileContent, fileName, mimeType);

                }.bind(this))
                .catch(function (oError) {
                    console.error("=== LỖI DOWNLOAD ===");
                    console.error("Error object:", oError);
                    console.error("Error message:", oError.message);
                    console.error("Error stack:", oError.stack);

                    let sErrorMsg = "Tải xuống thất bại";
                    if (oError.message) {
                        sErrorMsg += ": " + oError.message;
                    }

                    MessageBox.error(sErrorMsg);
                });
        },

        _hookDownloadButton: function () {
            try {
                let buttons = document.querySelectorAll("button");
                buttons.forEach(function (btn) {
                    let text = btn.textContent || btn.innerText || '';
                    if (text.toLowerCase().indexOf('download') > -1) {
                        console.log("Download button detected:", text);
                    }
                });
            } catch (error) {
                // Silent fail
            }
        },

        _handleDownloadResponse: function (oBinding, oActionContext) {
            try {
                console.log("Handling download response");

                let oBoundContext = oBinding.getBoundContext();
                if (!oBoundContext) {
                    console.error("No bound context");
                    return;
                }

                let oData = oBoundContext.getObject();
                console.log("Response data:", oData);

                if (!oData) return;

                let fileContent = oData.FileContent;
                let fileName = oData.FileName || "attachment.pdf";
                let mimeType = oData.MimeType || "application/pdf";

                if (fileContent) {
                    this._performFileDownload(fileContent, fileName, mimeType);
                } else {
                    console.error("No file content in response");
                }
            } catch (error) {
                console.error("Error handling download response:", error);
                MessageBox.error("Error handling download: " + error.message);
            }
        },

        // METHOD DOWNLOAD FILE - CHỈ TẢI XUỐNG, KHÔNG MỞ TAB
        _performFileDownload: function (base64Content, fileName, mimeType) {
            try {
                console.log("=== PERFORMING FILE DOWNLOAD ===");
                console.log("File:", fileName);
                console.log("MIME Type:", mimeType);
                console.log("Content size:", base64Content.length);

                let cleanBase64 = base64Content.replace(/\s/g, '');

                if (cleanBase64.indexOf('data:') === 0) {
                    cleanBase64 = cleanBase64.split(',')[1];
                }

                let binaryString = atob(cleanBase64);
                let bytes = new Uint8Array(binaryString.length);

                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                let blob = new Blob([bytes], { type: mimeType });
                console.log("Blob created:", blob.size, "bytes");

                // TẠO LINK DOWNLOAD - KHÔNG MỞ TAB MỚI
                let url = URL.createObjectURL(blob);
                let link = document.createElement('a');

                link.href = url;
                link.download = fileName;
                link.style.display = 'none';

                document.body.appendChild(link);
                link.click();

                setTimeout(function () {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 100);

                MessageToast.show("Đang tải xuống: " + fileName);
                console.log("=== DOWNLOAD COMPLETED ===");

            } catch (error) {
                console.error("=== DOWNLOAD ERROR ===", error);
                if (error.name === 'InvalidCharacterError') {
                    MessageBox.error("File không hợp lệ hoặc bị hỏng");
                } else {
                    MessageBox.error("Không thể tải xuống file: " + error.message);
                }
            }
        },

        //===================================================
        // XỬ LÝ PRINT FORM PDF (MỞ TAB MỚI)
        //===================================================
        _initializePDFHandler: function () {
            this._interceptODataModel();
            this._setupHTTPInterceptors();
        },

        _interceptODataModel: function () {
            try {
                let oModel = this.base.getView().getModel();
                if (!oModel) return;

                let that = this;
                let originalCallFunction = oModel.callFunction;

                if (originalCallFunction) {
                    oModel.callFunction = function (sFunctionName, mParameters) {
                        if (sFunctionName && sFunctionName.toLowerCase().indexOf('print') > -1) {
                            if (mParameters && mParameters.success) {
                                let originalSuccess = mParameters.success;
                                mParameters.success = function (oData, response) {
                                    that._handlePrintResponse(oData, response);
                                    if (originalSuccess) {
                                        originalSuccess.apply(this, arguments);
                                    }
                                };
                            }
                        }
                        return originalCallFunction.apply(this, arguments);
                    };
                }
            } catch (error) {
                // Silent fail
            }
        },

        _setupHTTPInterceptors: function () {
            let that = this;

            // Fetch interceptor
            if (typeof window.fetch === "function" && !window.__pdfFetchHooked) {
                let originalFetch = window.fetch;

                window.fetch = function (url, options) {
                    let urlStr = typeof url === "string" ? url : url.url;

                    return originalFetch.apply(this, arguments).then(function (response) {
                        if (urlStr && (urlStr.toLowerCase().indexOf('print') > -1 ||
                            urlStr.toLowerCase().indexOf('pdf') > -1)) {
                            let cloned = response.clone();
                            cloned.text().then(function (text) {
                                that._processPDFResponse(text, urlStr);
                            }).catch(function (err) {
                                // Silent fail
                            });
                        }
                        return response;
                    });
                };

                window.__pdfFetchHooked = true;
            }

            // XHR interceptor
            if (!XMLHttpRequest.prototype.__pdfXHRHooked) {
                let XHROpen = XMLHttpRequest.prototype.open;
                let XHRSend = XMLHttpRequest.prototype.send;

                XMLHttpRequest.prototype.open = function (method, url) {
                    this._url = url;
                    return XHROpen.apply(this, arguments);
                };

                XMLHttpRequest.prototype.send = function () {
                    let xhr = this;
                    let url = xhr._url || '';

                    let origStateChange = xhr.onreadystatechange;
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4 && xhr.status === 200) {
                            let responseUrl = xhr.responseURL || url;

                            if (responseUrl && responseUrl.indexOf('$batch') > -1) {
                                if (xhr.responseText.toLowerCase().indexOf('print') > -1 ||
                                    xhr.responseText.toLowerCase().indexOf('pdf') > -1 ||
                                    xhr.responseText.length > 50000) {
                                    that._processPDFResponse(xhr.responseText, responseUrl);
                                }
                            }

                            if (responseUrl && (responseUrl.toLowerCase().indexOf('print') > -1 ||
                                responseUrl.toLowerCase().indexOf('pdf') > -1)) {
                                that._processPDFResponse(xhr.responseText, responseUrl);
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

        _hookPrintButton: function () {
            try {
                let buttons = document.querySelectorAll("button");
                buttons.forEach(function (btn) {
                    let text = btn.textContent || btn.innerText || '';
                    if (text.toLowerCase().indexOf('print') > -1) {
                        console.log("Print button detected:", text);
                    }
                });
            } catch (error) {
                // Silent fail
            }
        },

        _handlePrintResponse: function (oData, response) {
            try {
                let pdfContent = null;
                let fileName = "Document.pdf";

                if (oData) {
                    pdfContent = oData.pdfContent || oData.PdfContent ||
                        oData.content || oData.Content || oData.pdf;
                    fileName = oData.FileName || oData.fileName || fileName;
                }

                if (pdfContent) {
                    this._openPDFInNewTab(pdfContent, fileName);
                }
            } catch (error) {
                // Silent fail
            }
        },

        _processPDFResponse: function (responseText, url) {
            try {
                if (responseText.indexOf('--batchresponse') > -1 ||
                    responseText.indexOf('Content-Type: multipart/mixed') > -1) {
                    this._parseBatchResponse(responseText);
                    return;
                }

                let data = JSON.parse(responseText);
                let pdfContent = null;
                let fileName = "Document.pdf";

                if (data.value && Array.isArray(data.value) && data.value.length > 0) {
                    let item = data.value[0];
                    pdfContent = item.pdfContent || item.PdfContent || item.content ||
                        item.pdf || item.Pdf || item.value;
                    fileName = item.FileName || item.fileName || fileName;
                } else {
                    pdfContent = data.pdfContent || data.PdfContent || data.content ||
                        data.pdf || data.Pdf;
                    fileName = data.FileName || data.fileName || fileName;
                }

                if (pdfContent) {
                    this._openPDFInNewTab(pdfContent, fileName);
                }
            } catch (error) {
                if (responseText.indexOf('{') > -1) {
                    this._extractJSONFromText(responseText);
                }
            }
        },

        _parseBatchResponse: function (batchText) {
            try {
                let boundaryMatch = batchText.match(/--[\w-]+/);
                let boundary = boundaryMatch ? boundaryMatch[0] : null;

                if (boundary) {
                    let parts = batchText.split(boundary);

                    for (let i = 0; i < parts.length; i++) {
                        let part = parts[i].trim();
                        if (part.length < 100) continue;

                        if (part.indexOf('application/json') > -1 || part.indexOf('{') > -1) {
                            let jsonStart = part.indexOf('{');
                            if (jsonStart > -1) {
                                let jsonText = part.substring(jsonStart);
                                let braceCount = 0;
                                let jsonEnd = -1;

                                for (let j = 0; j < jsonText.length; j++) {
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
                                    let jsonString = jsonText.substring(0, jsonEnd);
                                    try {
                                        let json = JSON.parse(jsonString);
                                        this._extractPDFFromData(json);
                                    } catch (parseErr) {
                                        // Silent fail
                                    }
                                }
                            }
                        }
                    }
                } else {
                    this._extractJSONFromText(batchText);
                }
            } catch (error) {
                // Silent fail
            }
        },

        _extractJSONFromText: function (text) {
            try {
                let jsonRegex = /\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;
                let matches = text.match(jsonRegex);

                if (matches) {
                    for (let i = 0; i < matches.length; i++) {
                        try {
                            let obj = JSON.parse(matches[i]);
                            this._extractPDFFromData(obj);
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            } catch (error) {
                // Silent fail
            }
        },

        _extractPDFFromData: function (data) {
            let pdfContent = null;
            let fileName = "Document.pdf";
            let found = false;

            for (let key in data) {
                let value = data[key];
                let keyLower = key.toLowerCase();

                if (keyLower.indexOf('pdf') > -1 ||
                    keyLower.indexOf('content') > -1 ||
                    keyLower.indexOf('file') > -1 ||
                    keyLower.indexOf('document') > -1) {

                    if (typeof value === "string" && value.length > 1000) {
                        let cleanValue = value.replace(/\s/g, '');
                        if (cleanValue.match(/^[A-Za-z0-9+/=]+$/)) {
                            pdfContent = cleanValue;
                            found = true;
                            break;
                        }
                    }
                }

                if (!found && typeof value === "string" && value.length > 5000) {
                    let cleanValue = value.replace(/\s/g, '');
                    if (cleanValue.match(/^[A-Za-z0-9+/=]+$/)) {
                        pdfContent = cleanValue;
                        found = true;
                        break;
                    }
                }

                if (!found && typeof value === "object" && value !== null && !Array.isArray(value)) {
                    if (this._searchObjectForPDF(value, key)) {
                        found = true;
                        break;
                    }
                }

                if (!found && Array.isArray(value)) {
                    for (let j = 0; j < value.length; j++) {
                        if (typeof value[j] === "object") {
                            if (this._searchObjectForPDF(value[j], key + "[" + j + "]")) {
                                found = true;
                                break;
                            }
                        }
                    }
                }
            }

            if (data.FileName || data.fileName || data.filename || data.name) {
                fileName = data.FileName || data.fileName || data.filename || data.name;
            }

            if (pdfContent) {
                this._openPDFInNewTab(pdfContent, fileName);
            }
        },

        _searchObjectForPDF: function (obj, path) {
            for (let key in obj) {
                let value = obj[key];
                let fullPath = path + "." + key;

                if (typeof value === "string" && value.length > 5000) {
                    let cleanValue = value.replace(/\s/g, '');
                    if (cleanValue.match(/^[A-Za-z0-9+/=]+$/)) {
                        this._openPDFInNewTab(cleanValue, "Document.pdf");
                        return true;
                    }
                }

                if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                    if (this._searchObjectForPDF(value, fullPath)) {
                        return true;
                    }
                }
            }
            return false;
        },

        // METHOD MỞ PDF TRONG TAB MỚI (CHỈ CHO PRINT)
        _openPDFInNewTab: function (base64Content, fileName) {
            try {
                console.log("=== OPENING PDF IN NEW TAB ===");
                console.log("File:", fileName);

                let cleanBase64 = base64Content.replace(/\s/g, '');

                if (cleanBase64.indexOf('data:') === 0) {
                    cleanBase64 = cleanBase64.split(',')[1];
                }

                let binary = atob(cleanBase64);
                let bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }

                // Validate PDF header nếu là file PDF
                let isPdfFile = fileName && fileName.toLowerCase().endsWith('.pdf');
                if (isPdfFile) {
                    let header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4]);
                    if (header !== '%PDF-') {
                        console.warn("PDF header check failed, but continuing anyway");
                    }
                }

                let blob = new Blob([bytes], { type: 'application/pdf' });
                let url = URL.createObjectURL(blob);

                // MỞ TAB MỚI
                let win = window.open(url, '_blank');

                if (!win) {
                    // Nếu popup bị chặn, fallback về download
                    console.warn("Popup blocked, falling back to download");
                    this._performFileDownload(base64Content, fileName, 'application/pdf');
                } else {
                    MessageToast.show("PDF opened successfully");
                }

                setTimeout(function () {
                    URL.revokeObjectURL(url);
                }, 60000);

                console.log("=== PDF OPENED ===");

            } catch (error) {
                console.error("=== PDF OPEN ERROR ===", error);
                // Fallback: download thay vì hiển thị error
                try {
                    this._performFileDownload(base64Content, fileName, 'application/pdf');
                } catch (fallbackError) {
                    MessageBox.error("Cannot open or download file");
                }
            }
        }
    });
});