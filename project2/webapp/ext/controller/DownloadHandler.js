sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
    "use strict";

    return {
        _isDownloading: false,
        _downloadRequestIds: new Set(),

        /**
         * Initialize the download handler
         * @param {object} oController - Controller instance
         */
        initialize: function (oController) {
            this._controller = oController;
        },

        /**
         * Setup event handlers for download buttons in tables
         * Delayed to ensure DOM is ready
         */
        setupTableEventHandlers: function () {
            var that = this;
            setTimeout(function () {
                that._attachDownloadButtonHandler();
            }, 1500);
        },

        /**
         * Find and attach handlers to download buttons in attachment tables
         */
        _attachDownloadButtonHandler: function () {
            var that = this;

            try {
                var oView = this._controller.getView();
                var aTables = oView.findAggregatedObjects(true, function (oControl) {
                    return oControl.isA("sap.m.Table");
                });

                // Process only attachment tables
                aTables.forEach(function (oTable) {
                    var oBinding = oTable.getBinding("items");
                    if (oBinding && oBinding.getPath()) {
                        var sPath = oBinding.getPath();

                        if (sPath.indexOf("_Attachments") > -1 || sPath.indexOf("Attach") > -1) {
                            that._hookAttachmentTable(oTable);
                        }
                    }
                });

            } catch (error) {
                console.error("Attach download handler error:", error);
            }
        },

        /**
         * Hook download handlers to all items in attachment table
         * @param {object} oTable - Table control instance
         */
        _hookAttachmentTable: function (oTable) {
            var that = this;

            // Attach to existing items
            var aItems = oTable.getItems();
            aItems.forEach(function (oItem) {
                that._attachItemDownloadHandler(oItem);
            });

            // Re-attach when table is updated
            oTable.attachUpdateFinished(function () {
                var aNewItems = oTable.getItems();
                aNewItems.forEach(function (oItem) {
                    that._attachItemDownloadHandler(oItem);
                });
            });
        },

        /**
         * Attach download handler to download buttons in a table item
         * @param {object} oItem - Table item (ColumnListItem)
         */
        _attachItemDownloadHandler: function (oItem) {
            var that = this;

            if (!oItem.getCells) return;

            // Find download buttons by text or icon
            oItem.getCells().forEach(function (oCell) {
                if (oCell.isA("sap.m.Button")) {
                    var sText = oCell.getText() || "";
                    var sIcon = oCell.getIcon() || "";

                    if (sText.toLowerCase().indexOf("download") > -1 ||
                        sIcon.indexOf("download") > -1) {

                        // Prevent duplicate handlers
                        oCell.detachPress(that._onDownloadButtonPress, that);
                        oCell.attachPress(that._onDownloadButtonPress, that);
                    }
                }
            });
        },

        /**
         * Handle download button press event
         * Extracts attachment keys from OData path and initiates download
         * @param {object} oEvent - Button press event
         */
        _onDownloadButtonPress: function (oEvent) {
            var oButton = oEvent.getSource();

            // Find parent row to get context
            var oRow = this._findParentRow(oButton);
            if (!oRow) {
                MessageBox.error("Cannot find attachment row");
                return;
            }

            // Get binding context from row
            var oContext = oRow.getBindingContext();
            if (!oContext) {
                MessageBox.error("Cannot get row context");
                return;
            }

            var sPath = oContext.getPath();

            // Extract keys from OData path (not from data object)
            var oKeys = this._extractKeysFromPath(sPath);

            if (!oKeys || !oKeys.ReqId || !oKeys.ApplicantId || !oKeys.AttachId) {
                MessageBox.error("Cannot extract attachment keys from path");
                return;
            }

            // Initiate download with extracted keys
            this.downloadAttachment(oContext, oKeys);
        },

        /**
         * Extract attachment keys from OData path
         * Path format: /ZC_MANAGE_REQ(...)/_Attachments(ReqId='...',ApplicantId='...',AttachId='...')
         * @param {string} sPath - OData entity path
         * @returns {object|null} Object containing ReqId, ApplicantId, AttachId or null if extraction fails
         */
        _extractKeysFromPath: function (sPath) {
            try {
                // Find _Attachments segment in path
                var attachMatch = sPath.match(/_Attachments\(([^)]+)\)/);
                if (!attachMatch) {
                    console.error("Cannot find _Attachments in path");
                    return null;
                }

                var keysStr = attachMatch[1];
                var oKeys = {};

                // Extract individual keys using regex
                var reqMatch = keysStr.match(/ReqId='([^']+)'/);
                if (reqMatch) oKeys.ReqId = reqMatch[1];

                var appMatch = keysStr.match(/ApplicantId='([^']+)'/);
                if (appMatch) oKeys.ApplicantId = appMatch[1];

                var attachIdMatch = keysStr.match(/AttachId='([^']+)'/);
                if (attachIdMatch) oKeys.AttachId = attachIdMatch[1];

                return oKeys;

            } catch (error) {
                console.error("Error extracting keys from path:", error);
                return null;
            }
        },

        /**
         * Find parent ColumnListItem row of a control
         * @param {object} oControl - Child control
         * @returns {object|null} Parent ColumnListItem or null
         */
        _findParentRow: function (oControl) {
            var oParent = oControl.getParent();
            while (oParent) {
                if (oParent.isA && oParent.isA("sap.m.ColumnListItem")) {
                    return oParent;
                }
                oParent = oParent.getParent();
            }
            return null;
        },

        /**
         * Download attachment file
         * Executes OData action and triggers file download
         * @param {object} oContext - Binding context of attachment
         * @param {object} oKeys - Attachment keys (ReqId, ApplicantId, AttachId)
         */
        downloadAttachment: function (oContext, oKeys) {
            if (!oKeys || !oKeys.ReqId || !oKeys.ApplicantId || !oKeys.AttachId) {
                MessageBox.error("Invalid attachment keys");
                return;
            }

            // Track download request
            var requestId = 'download_' + Date.now() + '_' + Math.random();
            this._downloadRequestIds.add(requestId);
            this._isDownloading = true;
            window._isDownloadingFile = true;

            var oModel = oContext.getModel();
            var sPath = oContext.getPath();

            // Build action path for download operation
            var sCleanPath = sPath.endsWith('/') ? sPath.slice(0, -1) : sPath;
            var sActionPath = sCleanPath + "/z4i_appr_attach.DownloadFile(...)";

            MessageToast.show("Preparing to download...");

            var oOperation = oModel.bindContext(sActionPath);

            oOperation.execute()
                .then(function () {
                    // Wait for operation to complete
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

                    // Extract file data from result
                    var fileContent = oResult.FileContent ||
                        oResult.fileContent ||
                        oResult.content;

                    var fileName = oResult.FileName ||
                        oResult.fileName ||
                        "download.pdf";

                    var mimeType = oResult.MimeType ||
                        oResult.mimeType ||
                        "application/pdf";

                    if (!fileContent) {
                        throw new Error("No file content in response");
                    }

                    this._performFileDownload(fileContent, fileName, mimeType);

                }.bind(this))
                .catch(function (oError) {
                    console.error("Download error:", oError);
                    var sErrorMsg = "Download failed";
                    if (oError.message) {
                        sErrorMsg += ": " + oError.message;
                    }
                    MessageBox.error(sErrorMsg);
                })
                .finally(function () {
                    // Cleanup download state after delay
                    setTimeout(function () {
                        this._downloadRequestIds.delete(requestId);
                        if (this._downloadRequestIds.size === 0) {
                            this._isDownloading = false;
                            window._isDownloadingFile = false;
                        }
                    }.bind(this), 1000);
                }.bind(this));
        },

        /**
         * Handle download response from action interceptor
         * @param {object} oBinding - OData binding instance
         * @param {object} oActionContext - Action execution context
         */
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
         * Perform actual file download
         * Converts base64 to blob and triggers browser download
         * @param {string} base64Content - Base64 encoded file content
         * @param {string} fileName - File name
         * @param {string} mimeType - MIME type of file
         */
        _performFileDownload: function (base64Content, fileName, mimeType) {
            try {
                // Clean and decode base64 content
                var cleanBase64 = base64Content.replace(/\s/g, '');

                if (cleanBase64.indexOf('data:') === 0) {
                    cleanBase64 = cleanBase64.split(',')[1];
                }

                var binaryString = atob(cleanBase64);
                var bytes = new Uint8Array(binaryString.length);

                for (var i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                // Create blob and trigger download
                var blob = new Blob([bytes], { type: mimeType });
                var url = URL.createObjectURL(blob);
                var link = document.createElement('a');

                link.href = url;
                link.download = fileName;
                link.style.display = 'none';

                document.body.appendChild(link);
                link.click();

                // Cleanup after download
                setTimeout(function () {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 100);

                MessageToast.show("Downloading: " + fileName);

            } catch (error) {
                if (error.name === 'InvalidCharacterError') {
                    MessageBox.error("Invalid File Content for download.");
                } else {
                    MessageBox.error("Cannot download file: " + error.message);
                }
            }
        },

        /**
         * Check if a download is currently in progress
         * @returns {boolean} True if downloading
         */
        isDownloading: function () {
            return this._isDownloading || window._isDownloadingFile || this._downloadRequestIds.size > 0;
        }
    };
});