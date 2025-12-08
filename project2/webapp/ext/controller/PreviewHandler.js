sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/PDFViewer"
], function (MessageToast, MessageBox, PDFViewer) {
    "use strict";

    return {
        _oPDFViewer: null,
        _controller: null,

        /**
         * Initialize the preview handler
         * @param {object} oController - Controller instance
         */
        initialize: function (oController) {
            this._controller = oController;
            this._oPDFViewer = new PDFViewer();
            oController.getView().addDependent(this._oPDFViewer);
        },

        /**
         * Setup event handlers for preview buttons in tables
         * Delayed to ensure DOM is ready
         */
        setupTableEventHandlers: function () {
            var that = this;
            setTimeout(function () {
                that._attachPreviewButtonHandler();
            }, 1500);
        },

        /**
         * Find and attach handlers to preview buttons in attachment tables
         */
        _attachPreviewButtonHandler: function () {
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
                console.error("Attach preview handler error:", error);
            }
        },

        /**
         * Hook preview handlers to all items in attachment table
         * @param {object} oTable - Table control instance
         */
        _hookAttachmentTable: function (oTable) {
            var that = this;

            // Attach to existing items
            var aItems = oTable.getItems();
            aItems.forEach(function (oItem) {
                that._attachItemPreviewHandler(oItem);
            });

            // Re-attach when table is updated
            oTable.attachUpdateFinished(function () {
                var aNewItems = oTable.getItems();
                aNewItems.forEach(function (oItem) {
                    that._attachItemPreviewHandler(oItem);
                });
            });
        },

        /**
         * Attach preview handler to preview buttons in a table item
         * @param {object} oItem - Table item (ColumnListItem)
         */
        _attachItemPreviewHandler: function (oItem) {
            var that = this;

            if (!oItem.getCells) return;

            // Find preview buttons by text or icon
            oItem.getCells().forEach(function (oCell) {
                if (oCell.isA("sap.m.Button")) {
                    var sText = oCell.getText() || "";
                    var sIcon = oCell.getIcon() || "";

                    if (sText.toLowerCase().indexOf("preview") > -1 ||
                        sIcon.indexOf("preview") > -1 ||
                        sIcon.indexOf("show") > -1) {

                        // Prevent duplicate handlers
                        oCell.detachPress(that._onPreviewButtonPress, that);
                        oCell.attachPress(that._onPreviewButtonPress, that);
                    }
                }
            });
        },

        /**
         * Handle preview button press event
         * @param {object} oEvent - Button press event
         */
        _onPreviewButtonPress: function (oEvent) {
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext();

            if (!oContext) {
                MessageBox.error("Cannot get attachment context");
                return;
            }

            this.previewAttachment(oContext);
        },

        /**
         * Preview attachment file from binding context
         * @param {object} oContext - Binding context containing attachment data
         */
        previewAttachment: function (oContext) {
            if (!oContext) {
                MessageBox.error("Unable to get attachment information");
                return;
            }

            var oData = oContext.getObject();
            var oModel = oContext.getModel();
            var sPath = oContext.getPath();

            // Build action path for preview operation
            var sCleanPath = sPath.endsWith('/') ? sPath.slice(0, -1) : sPath;
            var sActionPath = sCleanPath + "/z4i_appr_attach.Preview(...)";

            MessageToast.show("Loading preview...");

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
                    var fileContent = oResult.FileContent || oResult.fileContent || oResult.content;
                    var fileName = oResult.FileName || oResult.fileName || oData.FileName || "preview.pdf";
                    var mimeType = oResult.MimeType || oResult.mimeType || oData.MimeType || "application/pdf";

                    if (!fileContent) {
                        throw new Error("No file content in response");
                    }

                    this._showPDFPreview(fileContent, fileName, mimeType);

                }.bind(this))
                .catch(function (oError) {
                    var sErrorMsg = "Preview failed";
                    if (oError.message) {
                        sErrorMsg += ": " + oError.message;
                    }
                    MessageBox.error(sErrorMsg);
                });
        },

        /**
         * Handle preview response from action interceptor
         * @param {object} oBinding - OData binding instance
         * @param {object} oActionContext - Action execution context
         */
        _handlePreviewResponse: function (oBinding, oActionContext) {
            try {
                var oBoundContext = oBinding.getBoundContext();
                if (!oBoundContext) return;

                var oData = oBoundContext.getObject();
                if (!oData) return;

                var fileContent = oData.FileContent;
                var fileName = oData.FileName || "preview.pdf";
                var mimeType = oData.MimeType || "application/pdf";

                if (fileContent) {
                    this._showPDFPreview(fileContent, fileName, mimeType);
                }
            } catch (error) {
                MessageBox.error("Error handling preview: " + error.message);
            }
        },

        /**
         * Display PDF preview in viewer
         * @param {string} base64Content - Base64 encoded file content
         * @param {string} fileName - File name
         * @param {string} mimeType - MIME type of file
         */
        _showPDFPreview: function (base64Content, fileName, mimeType) {
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

                // Create blob and object URL
                var blob = new Blob([bytes], { type: mimeType });
                var url = URL.createObjectURL(blob);

                // Open PDF in viewer
                this._oPDFViewer.setSource(url);
                this._oPDFViewer.setTitle(fileName);
                this._oPDFViewer.open();

                MessageToast.show("Preview opened: " + fileName);

                // Refresh attachment tables after preview
                setTimeout(function () {
                    this._refreshAttachmentTables();
                }.bind(this), 500);

                // Cleanup URL after 60 seconds
                setTimeout(function () {
                    URL.revokeObjectURL(url);
                }, 60000);

            } catch (error) {
                MessageBox.error("Cannot preview file: " + error.message);
            }
        },

        /**
         * Refresh all attachment tables to reflect latest data
         * Called after preview to update UI state
         */
        _refreshAttachmentTables: function () {
            try {
                var oView = this._controller.getView();
                var aTables = oView.findAggregatedObjects(true, function (oControl) {
                    return oControl.isA("sap.m.Table");
                });

                aTables.forEach(function (oTable) {
                    var oBinding = oTable.getBinding("items");
                    if (oBinding && oBinding.getPath) {
                        var sPath = oBinding.getPath();

                        // Only refresh attachment tables
                        if (sPath.indexOf("_Attachments") > -1 || sPath.indexOf("Attach") > -1) {

                            // Refresh OData V4 binding
                            if (oBinding.refresh) {
                                oBinding.refresh();
                            }

                            // Alternative: Re-request contexts
                            if (oBinding.requestContexts) {
                                oBinding.requestContexts(0, 100);
                            }
                        }
                    }
                });
            } catch (error) {
                console.error("Error refreshing tables:", error);
            }
        }
    };
});