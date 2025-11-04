sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "project1/ext/controller/DownloadHandler",
    "project1/ext/controller/PrintHandler"
], function (ControllerExtension, DownloadHandler, PrintHandler) {
    "use strict";

    /**
     * ===================================================
     * MAIN CONTROLLER EXTENSION
     * ===================================================
     * File: webapp/ext/controller/ObjectPageExt.js
     * Chức năng: Controller chính - khởi tạo và điều phối các handlers
     */

    return ControllerExtension.extend("project1.ext.controller.ObjectPageExt", {

        override: {
            /**
             * Lifecycle: onInit
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
             * Lifecycle: onAfterRendering
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
         * ===================================================
         * PRIVATE METHODS
         * ===================================================
         */

        /**
         * Khởi tạo tất cả handlers
         */
        _initializeHandlers: function () {
            try {
                // 1. Khởi tạo Download Handler
                DownloadHandler.initialize(this.base);

                // 2. Khởi tạo Print Handler với DownloadHandler reference
                PrintHandler.initialize(this.base, DownloadHandler);

                // 3. Setup table handlers cho download
                DownloadHandler.setupTableEventHandlers();

            } catch (error) {
                // Silent error
            }
        },

        /**
         * Setup handlers sau khi rendering
         */
        _setupAfterRenderingHandlers: function () {
            try {
                DownloadHandler.setupTableEventHandlers();
            } catch (error) {
                // Silent error
            }
        },

        /**
         * ===================================================
         * PUBLIC API - Có thể gọi từ bên ngoài
         * ===================================================
         */

        /**
         * Download một attachment
         * @public
         * @param {sap.ui.model.Context} oContext - Context của attachment cần download
         */
        downloadAttachment: function (oContext) {
            DownloadHandler.downloadAttachment(oContext);
        },

        /**
         * Mở PDF trong tab mới để xem/in
         * @public
         * @param {string} base64Content - Nội dung PDF dạng base64
         * @param {string} fileName - Tên file PDF
         */
        openPDFInNewTab: function (base64Content, fileName) {
            PrintHandler.openPDFInNewTab(base64Content, fileName);
        }
    });
});