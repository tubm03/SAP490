sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "project2/ext/controller/DownloadHandler",
    "project2/ext/controller/PrintHandler",
    "project2/ext/controller/PreviewHandler",
    "project2/ext/controller/ActionInterceptor"
], function (ControllerExtension, DownloadHandler, PrintHandler, PreviewHandler, ActionInterceptor) {
    "use strict";

    return ControllerExtension.extend("project2.ext.controller.ObjectPageExt", {

        override: {
            /**
             * Initialize the controller extension
             * Sets up handlers with delay to ensure view is ready
             */
            onInit: function () {
                if (this.base && this.base.onInit) {
                    this.base.onInit.apply(this, arguments);
                }

                setTimeout(function () {
                    this._initializeHandlers();
                }.bind(this), 500);
            },

            /**
             * After rendering hook
             * Re-establishes event handlers after view updates
             */
            onAfterRendering: function () {
                if (this.base && this.base.onAfterRendering) {
                    this.base.onAfterRendering.apply(this, arguments);
                }

                setTimeout(function () {
                    this._setupAfterRenderingHandlers();
                }.bind(this), 1000);
            }
        },

        /**
         * Initialize all handlers in correct order
         * 1. Initialize individual handlers (Download, Preview, Print)
         * 2. Setup unified action interceptor
         * 3. Attach table event handlers
         */
        _initializeHandlers: function () {
            try {
                // Initialize handlers first (without interceptors)
                DownloadHandler.initialize(this.base);
                PreviewHandler.initialize(this.base);
                PrintHandler.initialize(this.base, DownloadHandler);

                // Setup unified interceptor after handlers are ready
                ActionInterceptor.initialize(
                    this.base,
                    DownloadHandler,
                    PreviewHandler
                );

                // Attach event handlers to table elements
                DownloadHandler.setupTableEventHandlers();
                PreviewHandler.setupTableEventHandlers();

            } catch (error) {
                console.error("Handler initialization error:", error);
            }
        },

        /**
         * Re-setup event handlers after rendering
         * Necessary because DOM elements may be recreated
         */
        _setupAfterRenderingHandlers: function () {
            try {
                DownloadHandler.setupTableEventHandlers();
                PreviewHandler.setupTableEventHandlers();
            } catch (error) {
                console.error("After rendering error:", error);
            }
        },

        /**
         * Download attachment from context
         * @param {object} oContext - Binding context containing attachment data
         */
        downloadAttachment: function (oContext) {
            DownloadHandler.downloadAttachment(oContext);
        },

        /**
         * Preview attachment from context
         * @param {object} oContext - Binding context containing attachment data
         */
        previewAttachment: function (oContext) {
            PreviewHandler.previewAttachment(oContext);
        },

        /**
         * Open PDF content in new browser tab
         * @param {string} base64Content - Base64 encoded PDF content
         * @param {string} fileName - Name of the PDF file
         */
        openPDFInNewTab: function (base64Content, fileName) {
            PrintHandler.openPDFInNewTab(base64Content, fileName);
        }
    });
});