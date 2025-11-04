sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
    "use strict";

    /**
     * ===================================================
     * DOWNLOAD HANDLER -
     * ===================================================
     * File: webapp/ext/controller/DownloadHandler.js
     * Chức năng: Download file CV/attachments 
     */

    return {
        _isDownloading: false,
        _downloadRequestIds: new Set(),

        initialize: function (oController) {
            this._controller = oController;
            this._setupDownloadInterceptors();
        },

        _setupDownloadInterceptors: function () {
            var that = this;

            try {
                var oModel = this._controller.getView().getModel();
                if (!oModel) return;

                var originalBindContext = oModel.bindContext;
                if (originalBindContext) {
                    oModel.bindContext = function (sPath, oContext, mParameters) {
                        var oBinding = originalBindContext.apply(this, arguments);

                        if (sPath && sPath.indexOf('DownloadFile') > -1) {
                            var requestId = 'download_' + Date.now() + '_' + Math.random();
                            that._downloadRequestIds.add(requestId);

                            var originalExecute = oBinding.execute;
                            if (originalExecute) {
                                oBinding.execute = function () {
                                    that._isDownloading = true;
                                    window._isDownloadingFile = true;

                                    return originalExecute.apply(this, arguments)
                                        .then(function (oContext) {
                                            that._handleDownloadResponse(oBinding, oContext);
                                            return oContext;
                                        })
                                        .catch(function (oError) {
                                            MessageBox.error("Download failed: " + (oError.message || "Unknown error"));
                                            throw oError;
                                        })
                                        .finally(function () {
                                            setTimeout(function () {
                                                that._downloadRequestIds.delete(requestId);
                                                if (that._downloadRequestIds.size === 0) {
                                                    that._isDownloading = false;
                                                    window._isDownloadingFile = false;
                                                }
                                            }, 1000);
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

        setupTableEventHandlers: function () {
            var that = this;
            setTimeout(function () {
                that._attachDownloadButtonHandler();
            }, 1500);
        },

        _attachDownloadButtonHandler: function () {
            var that = this;

            try {
                var oView = this._controller.getView();
                var aTables = oView.findAggregatedObjects(true, function (oControl) {
                    return oControl.isA("sap.m.Table");
                });

                aTables.forEach(function (oTable) {
                    var oBinding = oTable.getBinding("items");
                    if (oBinding && oBinding.getPath()) {
                        var sPath = oBinding.getPath();

                        if (sPath.indexOf("_Attachments") > -1 || sPath.indexOf("Attach") > -1) {
                            that._hookAttachmentTable(oTable);
                        }
                    }
                });

                that._interceptDownloadButtons();

            } catch (error) {
                // Silent error
            }
        },

        _hookAttachmentTable: function (oTable) {
            var that = this;

            var aItems = oTable.getItems();
            aItems.forEach(function (oItem) {
                that._attachItemDownloadHandler(oItem);
            });

            oTable.attachUpdateFinished(function () {
                var aNewItems = oTable.getItems();
                aNewItems.forEach(function (oItem) {
                    that._attachItemDownloadHandler(oItem);
                });
            });
        },

        _attachItemDownloadHandler: function (oItem) {
            var that = this;

            if (!oItem.getCells) return;

            oItem.getCells().forEach(function (oCell) {
                if (oCell.isA("sap.m.Button")) {
                    var sText = oCell.getText() || "";
                    var sIcon = oCell.getIcon() || "";

                    if (sText.toLowerCase().indexOf("download") > -1 ||
                        sIcon.indexOf("download") > -1) {

                        oCell.detachPress(that._onDownloadButtonPress, that);
                        oCell.attachPress(that._onDownloadButtonPress, that);
                    }
                }
            });
        },

        _onDownloadButtonPress: function (oEvent) {
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext();

            if (!oContext) {
                MessageBox.error("Cannot get attachment context");
                return;
            }

            this.downloadAttachment(oContext);
        },

        _interceptDownloadButtons: function () {
            var that = this;

            var observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    mutation.addedNodes.forEach(function (node) {
                        if (node.nodeType === 1) {
                            var buttons = [];

                            if (node.nodeName === 'BUTTON') {
                                buttons.push(node);
                            } else if (node.querySelectorAll) {
                                buttons = Array.from(node.querySelectorAll('button'));
                            }

                            buttons.forEach(function (btn) {
                                var text = btn.textContent || btn.innerText || '';
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
                var oView = this._controller.getView();
                var sControlId = button.id;

                if (sControlId) {
                    var oControl = oView.byId(sControlId) || sap.ui.getCore().byId(sControlId);
                    if (oControl && oControl.getBindingContext) {
                        var oContext = oControl.getBindingContext();
                        if (oContext) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.downloadAttachment(oContext);
                            return;
                        }
                    }
                }

                var row = button.closest('tr');
                if (row && row.id) {
                    var oRowControl = sap.ui.getCore().byId(row.id);
                    if (oRowControl && oRowControl.getBindingContext) {
                        var oContext = oRowControl.getBindingContext();
                        if (oContext) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.downloadAttachment(oContext);
                        }
                    }
                }
            } catch (error) {
                // Silent error
            }
        },

        /**
         * ===================================================
         * PUBLIC METHOD: Download attachment
         * ===================================================
         */
        downloadAttachment: function (oContext) {
            if (!oContext) {
                MessageBox.error("Unable to get attachment information");
                return;
            }

            var requestId = 'download_' + Date.now() + '_' + Math.random();
            this._downloadRequestIds.add(requestId);
            this._isDownloading = true;
            window._isDownloadingFile = true;

            var oData = oContext.getObject();
            var oModel = oContext.getModel();
            var sPath = oContext.getPath();

            var sCleanPath = sPath.endsWith('/') ? sPath.slice(0, -1) : sPath;
            var sActionPath = sCleanPath + "/z4i_appr_attach.DownloadFile(...)";

            MessageToast.show("Preparing to download...");

            var oOperation = oModel.bindContext(sActionPath);

            oOperation.execute()
                .then(function () {
                    return new Promise(function (resolve) {
                        setTimeout(function () {
                            resolve(oOperation);
                        }, 100);
                    });
                })
                .then(function (oOperation) {
                    var oBoundContext = oOperation.getBoundContext();

                    if (!oBoundContext) {
                        throw new Error("Not getting bound context from action");
                    }

                    var oResult = oBoundContext.getObject();

                    if (!oResult) {
                        throw new Error("No data in result");
                    }

                    var fileContent = oResult.FileContent ||
                        oResult.fileContent ||
                        oResult.filecontent ||
                        oResult.Content ||
                        oResult.content;

                    var fileName = oResult.FileName ||
                        oResult.fileName ||
                        oData.FileName ||
                        "download.pdf";

                    var mimeType = oResult.MimeType ||
                        oResult.mimeType ||
                        oData.MimeType ||
                        "application/pdf";

                    if (!fileContent) {
                        throw new Error("No file content in response");
                    }

                    this._performFileDownload(fileContent, fileName, mimeType);

                }.bind(this))
                .catch(function (oError) {
                    var sErrorMsg = "Download failed";
                    if (oError.message) {
                        sErrorMsg += ": " + oError.message;
                    }
                    MessageBox.error(sErrorMsg);
                })
                .finally(function () {
                    setTimeout(function () {
                        this._downloadRequestIds.delete(requestId);
                        if (this._downloadRequestIds.size === 0) {
                            this._isDownloading = false;
                            window._isDownloadingFile = false;
                        }
                    }.bind(this), 1000);
                }.bind(this));
        },

        _handleDownloadResponse: function (oBinding, oActionContext) {
            try {
                var oBoundContext = oBinding.getBoundContext();
                if (!oBoundContext) return;

                var oData = oBoundContext.getObject();
                if (!oData) return;

                var fileContent = oData.FileContent;
                var fileName = oData.FileName || "attachment.pdf";
                var mimeType = oData.MimeType || "application/pdf";

                if (fileContent) {
                    this._performFileDownload(fileContent, fileName, mimeType);
                }
            } catch (error) {
                MessageBox.error("Error handling download: " + error.message);
            }
        },

        /**
         * ===================================================
         * PERFORM FILE DOWNLOAD 
         * ===================================================
         */
        _performFileDownload: function (base64Content, fileName, mimeType) {
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

                var blob = new Blob([bytes], { type: mimeType });

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

                MessageToast.show("Downloading: " + fileName);

            } catch (error) {
                if (error.name === 'InvalidCharacterError') {
                    MessageBox.error("Invalid File Content for download.");
                } else {
                    MessageBox.error("cannot download file: " + error.message);
                }
            }
        },

        /**
         * PUBLIC METHOD: Check if currently downloading
         */
        isDownloading: function () {
            return this._isDownloading || window._isDownloadingFile || this._downloadRequestIds.size > 0;
        }
    };
});