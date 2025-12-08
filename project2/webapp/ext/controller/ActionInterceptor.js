sap.ui.define([
    "sap/m/MessageBox"
], function (MessageBox) {
    "use strict";

    return {
        _isInitialized: false,
        _downloadHandler: null,
        _previewHandler: null,

        /**
         * Initialize the action interceptor with download and preview handlers
         * @param {object} oController - The controller instance
         * @param {object} downloadHandler - Handler for download operations
         * @param {object} previewHandler - Handler for preview operations
         */
        initialize: function (oController, downloadHandler, previewHandler) {
            if (this._isInitialized) {
                return;
            }

            this._downloadHandler = downloadHandler;
            this._previewHandler = previewHandler;
            this._setupUnifiedInterceptor(oController);
            this._isInitialized = true;
        },

        /**
         * Setup unified interceptor for both download and preview actions
         * Intercepts bindContext calls to handle file operations
         * @param {object} oController - The controller instance
         */
        _setupUnifiedInterceptor: function (oController) {
            var that = this;

            try {
                var oModel = oController.getView().getModel();
                if (!oModel) {
                    console.error("Model not found");
                    return;
                }

                var originalBindContext = oModel.bindContext;

                // Override bindContext only once to avoid multiple interceptions
                if (!originalBindContext._isIntercepted) {

                    oModel.bindContext = function (sPath, oContext, mParameters) {
                        var oBinding = originalBindContext.apply(this, arguments);

                        // Intercept download and preview operations based on path
                        if (sPath) {
                            if (sPath.indexOf('DownloadFile') > -1) {
                                that._interceptDownload(oBinding);
                            } else if (sPath.indexOf('Preview') > -1) {
                                that._interceptPreview(oBinding);
                            }
                        }

                        return oBinding;
                    };

                    // Mark as intercepted to prevent multiple overrides
                    oModel.bindContext._isIntercepted = true;
                }
            } catch (error) {
                console.error("Interceptor setup error:", error);
            }
        },

        /**
         * Intercept download operations
         * Tracks download state and handles response/errors
         * @param {object} oBinding - The OData binding instance
         */
        _interceptDownload: function (oBinding) {
            var that = this;
            var originalExecute = oBinding.execute;

            if (originalExecute) {
                oBinding.execute = function () {
                    // Generate unique request ID for tracking
                    var requestId = 'download_' + Date.now() + '_' + Math.random();

                    // Set download state flags
                    if (that._downloadHandler) {
                        that._downloadHandler._downloadRequestIds.add(requestId);
                        that._downloadHandler._isDownloading = true;
                        window._isDownloadingFile = true;
                    }

                    return originalExecute.apply(this, arguments)
                        .then(function (oContext) {
                            // Handle successful download response
                            if (that._downloadHandler) {
                                that._downloadHandler._handleDownloadResponse(oBinding, oContext);
                            }
                            return oContext;
                        })
                        .catch(function (oError) {
                            console.error("Download execute error:", oError);
                            MessageBox.error("Download failed: " + (oError.message || "Unknown error"));
                            throw oError;
                        })
                        .finally(function () {
                            // Cleanup download state after completion
                            setTimeout(function () {
                                if (that._downloadHandler) {
                                    that._downloadHandler._downloadRequestIds.delete(requestId);
                                    if (that._downloadHandler._downloadRequestIds.size === 0) {
                                        that._downloadHandler._isDownloading = false;
                                        window._isDownloadingFile = false;
                                    }
                                }
                            }, 1000);
                        });
                };
            }
        },

        /**
         * Intercept preview operations
         * Handles preview response and errors
         * @param {object} oBinding - The OData binding instance
         */
        _interceptPreview: function (oBinding) {
            var that = this;
            var originalExecute = oBinding.execute;

            if (originalExecute) {
                oBinding.execute = function () {
                    return originalExecute.apply(this, arguments)
                        .then(function (oContext) {
                            // Handle successful preview response
                            if (that._previewHandler) {
                                that._previewHandler._handlePreviewResponse(oBinding, oContext);
                            }
                            return oContext;
                        })
                        .catch(function (oError) {
                            console.error("Preview execute error:", oError);
                            MessageBox.error("Preview failed: " + (oError.message || "Unknown error"));
                            throw oError;
                        });
                };
            }
        }
    };
});