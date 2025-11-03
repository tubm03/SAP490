sap.ui.define([
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/BusyIndicator"
], function (MessageBox, MessageToast, Fragment, JSONModel, BusyIndicator) {
    "use strict";

    return {
        onInit: function () {
            console.log("✅ ListReportExt - onInit");
        },

        beforeSendMail: async function () {
            console.log("🟢 beforeSendMail called");

            let aContexts = [];
            try {
                aContexts = this.extensionAPI.getSelectedContexts();
            } catch (e) {
                console.error("Error getting contexts:", e);
            }

            if (!aContexts || aContexts.length === 0) {
                MessageBox.warning("Please select a requisition");
                return;
            }

            const oContext = aContexts[0];
            this._oCurrentContext = oContext;

            // ✅ Read full data from backend
            const oData = await this._readFullDataFromBackend(oContext);

            if (!oData) {
                MessageBox.error("Failed to load requisition data");
                return;
            }

            console.log("📥 Full data from backend:", oData);

            const sPosition = oData.PositionText || "Position";
            const sReqId = oData.ReqId || "";
            const sFullName = oData.fullName || "Candidate Name";
            const sEmail = oData.EmailAddress || "";
            const sDepartment = oData.OrgUnitText || "";

            const sEmailContent = `Dear ${sFullName},

Thank you for taking the time to participate in our recruitment process at E-Tech Company.

We are pleased to inform you that you have been selected for the position of ${sPosition}.

Your expected start date is ../../...., and more details will be shared shortly.

We will send your official Offer Letter to this email address soon.

Best regards,
HR Department
E-Tech Company`;

            const oDialogData = {
                ReqId: sReqId,
                FullName: sFullName,
                Position: sPosition,
                Email: sEmail,
                Department: sDepartment,
                Subject: "Job Offer Notification – E-Tech Company",
                EmailContent: sEmailContent
            };

            this._openSendMailDialog(oDialogData);
        },

        // ✅ Read full data from backend
        _readFullDataFromBackend: function (oContext) {
            const oController = this;
            
            return new Promise(function (resolve, reject) {
                BusyIndicator.show(0);

                const oModel = oContext.getModel();
                const sContextPath = oContext.getPath();

                console.log("📖 Reading data from:", sContextPath);

                oModel.read(sContextPath, {
                    success: function (oData) {
                        BusyIndicator.hide();
                        console.log("✅ Full data loaded:", oData);
                        resolve(oData);
                    },
                    error: function (oError) {
                        BusyIndicator.hide();
                        console.error("❌ Error reading data:", oError);
                        reject(oError);
                    }
                });
            });
        },

        // ✅ Open send mail dialog
        _openSendMailDialog: async function (oData) {
            const oView = this.getView();
            const oController = this;

            if (this._pSendMailDialog) {
                try {
                    const oDialog = await this._pSendMailDialog;
                    oDialog.getModel("dialog").setData(oData);
                    oDialog.open();
                    return;
                } catch (err) {
                    console.error("❌ Error opening existing dialog:", err);
                }
            }

            try {
                this._pSendMailDialog = Fragment.load({
                    id: oView.createId("SendMailDialog"),
                    name: "project1.ext.fragments.SendMailDialog",
                    controller: this
                });

                const oDialog = await this._pSendMailDialog;
                oView.addDependent(oDialog);

                const oDialogModel = new JSONModel(oData);
                oDialog.setModel(oDialogModel, "dialog");

                oDialog.open();
                console.log("✅ Send Mail Dialog opened:", oData);

            } catch (err) {
                console.error("❌ Failed to load fragment:", err);
                MessageBox.error("Failed to open Send Mail dialog.");
            }
        },

        // ✅ Handle send email confirm
        onSendEmailConfirm: async function () {
            const oView = this.getView();
            const oController = this;

            const sEmail = Fragment.byId(oView.createId("SendMailDialog"), "emailInput").getValue();
            const sSubject = Fragment.byId(oView.createId("SendMailDialog"), "subjectInput").getValue();
            const sContent = Fragment.byId(oView.createId("SendMailDialog"), "emailContentArea").getValue();

            // ✅ Validate input
            if (!sEmail || !this._isValidEmail(sEmail)) {
                MessageBox.warning("Please enter a valid email address");
                return;
            }

            if (!sSubject) {
                MessageBox.warning("Email subject cannot be empty");
                return;
            }

            if (!sContent) {
                MessageBox.warning("Email content cannot be empty");
                return;
            }

            let sFileName = "";
            let sFileBase64 = "";

            try {
                // ✅ Get file từ sap.ui.unified.FileUploader
                const oFileUploader = Fragment.byId(oView.createId("SendMailDialog"), "chooseFileBtn");
                
                if (oFileUploader) {
                    console.log("📎 FileUploader object:", oFileUploader);
                    
                    // ✅ Cách lấy file từ FileUploader SAPUI5
                    const oDomRef = oFileUploader.getDomRef();
                    const aFiles = oDomRef?.querySelector("input[type='file']")?.files;
                    
                    if (aFiles && aFiles.length > 0) {
                        const oFile = aFiles[0];
                        console.log("📎 File selected:", oFile.name, "Size:", oFile.size, "Type:", oFile.type);
                        
                        // ✅ Kiểm tra file size (max 5MB)
                        if (oFile.size > 5242880) {
                            MessageBox.warning("File size exceeds 5MB limit");
                            return;
                        }
                        
                        sFileName = oFile.name;
                        sFileBase64 = await oController._readFileAsBase64(oFile);
                        console.log("✅ File converted to Base64, length:", sFileBase64.length);
                    } else {
                        console.log("ℹ️ No file selected - email will be sent without attachment");
                    }
                } else {
                    console.warn("⚠️ FileUploader control not found");
                }
            } catch (err) {
                console.error("❌ Error reading file:", err);
                console.log("📋 Stack trace:", err.stack);
                MessageBox.warning("Error reading file. Continuing without attachment...");
            }

            // ✅ Confirm before sending
            MessageBox.confirm(`Send email to: ${sEmail}?`, {
                title: "Confirm Send",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        oController._sendEmailViaFM(sEmail, sSubject, sContent, sFileName, sFileBase64);
                    }
                }
            });
        },

        // ✅ Convert file to Base64
        _readFileAsBase64: function (file) {
            return new Promise(function (resolve, reject) {
                try {
                    const reader = new FileReader();
                    
                    reader.onload = function () {
                        try {
                            // ✅ Tách phần base64 từ Data URL
                            const result = reader.result;
                            const base64 = result.indexOf(",") > -1 ? result.split(",")[1] : result;
                            console.log("✅ File read successfully, Base64 length:", base64.length);
                            resolve(base64);
                        } catch (err) {
                            console.error("Error processing file:", err);
                            reject(err);
                        }
                    };
                    
                    reader.onerror = function () {
                        console.error("FileReader error:", reader.error);
                        reject(reader.error);
                    };
                    
                    reader.onprogress = function (event) {
                        if (event.lengthComputable) {
                            console.log("📖 Reading file: " + Math.round((event.loaded / event.total) * 100) + "%");
                        }
                    };
                    
                    console.log("📖 Starting to read file:", file.name, "size:", file.size);
                    reader.readAsDataURL(file);
                    
                } catch (err) {
                    console.error("Error in FileReader setup:", err);
                    reject(err);
                }
            });
        },

        // ✅ SEND EMAIL VIA ODATA ACTION
        _sendEmailViaFM: function (sEmail, sSubject, sContent, sFileName, sFileBase64) {
            BusyIndicator.show(0);

            const oController = this;

            try {
                console.log("📤 Calling OData Action: sendMail");
                console.log("   Email:", sEmail);
                console.log("   Subject:", sSubject);

                const oModel = this.getOwnerComponent().getModel();
                
                // ✅ Extract ReqId and ApplicantId from context
                const oKey = this._oCurrentContext.getProperty();
                const sReqId = oKey.ReqId;
                const sApplicantId = oKey.ApplicantId;

                console.log("📤 Action Parameters - ReqId:", sReqId, "ApplicantId:", sApplicantId);

                // ✅ Action path using FunctionImport
                const sActionPath = "/sendMail";

                const oPayload = {
                    ReqId: sReqId,
                    ApplicantId: sApplicantId,
                    Email: sEmail,
                    Subject: sSubject,
                    Content: sContent,
                    FileName: sFileName || "",
                    FileBase64: sFileBase64 || ""
                };

                console.log("📤 Full Payload:", JSON.stringify(oPayload, null, 2));

                // ✅ Call OData FunctionImport - refreshSecurityToken first
                oModel.refreshSecurityToken(
                    function (oResponse) {
                        console.log("✅ Security token refreshed");
                        
                        oModel.callFunction(sActionPath, {
                            method: "POST",
                            urlParameters: oPayload,
                            bUrlEncoded: false,
                            success: function (oResponse) {
                                BusyIndicator.hide();
                                console.log("✅ OData Action Success:", oResponse);

                                // ✅ If response has sendMail object = SUCCESS
                                if (oResponse && oResponse.sendMail) {
                                    MessageToast.show("✅ Email sent successfully!");

                                    // ✅ Close dialog
                                    if (oController._pSendMailDialog) {
                                        oController._pSendMailDialog.then(function (dlg) {
                                            dlg.close();
                                        }).catch(function (err) {
                                            console.error("Error closing dialog:", err);
                                        });
                                    }

                                    // ✅ Refresh list
                                    if (oController.extensionAPI && oController.extensionAPI.refresh) {
                                        oController.extensionAPI.refresh();
                                    }

                                    console.log("✅ Email send complete");
                                } else {
                                    MessageBox.error("❌ No response from server");
                                }
                            },
                            error: function (oError) {
                                BusyIndicator.hide();
                                console.error("❌ OData Action Error:", oError);

                                let sErrorMsg = "Failed to send email";
                                if (oError.responseText) {
                                    try {
                                        const oErrorResponse = JSON.parse(oError.responseText);
                                        if (oErrorResponse.error && oErrorResponse.error.message) {
                                            sErrorMsg = oErrorResponse.error.message.value || oErrorResponse.error.message;
                                        }
                                    } catch (e) {
                                        sErrorMsg = oError.responseText || "Failed to send email";
                                    }
                                }

                                MessageBox.error("❌ " + sErrorMsg);
                            }
                        });
                    },
                    function (oError) {
                        BusyIndicator.hide();
                        console.error("❌ Failed to refresh security token:", oError);
                        MessageBox.error("❌ Security token refresh failed");
                    }
                );

            } catch (oError) {
                BusyIndicator.hide();
                console.error("❌ Exception Error:", oError);
                MessageBox.error("❌ " + (oError.message || "Failed to send email"));
            }
        },

        // ✅ Validate email
        _isValidEmail: function (sEmail) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(sEmail);
        },

        // ✅ Cancel send mail dialog
        onCancelSendMail: function () {
            if (this._pSendMailDialog) {
                this._pSendMailDialog.then(function (dlg) {
                    dlg.close();
                }).catch(function (err) {
                    console.error("Error closing dialog:", err);
                });
            }
        }
    };
});