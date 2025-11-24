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
            
            // ✅ Gọi onAfterRendering sau khi UI render xong
            this.getView().attachAfterRendering(this._setupSelectionListener, this);
        },

        // ✅ Setup listener cho selection change
        _setupSelectionListener: function () {
            const oView = this.getView();
            
            // Tìm table trong ListReport (có thể là ResponsiveTable hoặc Table)
            let oTable = oView.byId("Requisition");
            if (!oTable) {
                oTable = oView.byId("ListReport-Requisition");
            }
            if (!oTable) {
                // Tìm tất cả tables
                const aTables = oView.findAggregatedObjects(true, (ctrl) => {
                    return ctrl.getMetadata && (
                        ctrl.getMetadata().getName().indexOf("Table") !== -1 ||
                        ctrl.getMetadata().getName().indexOf("Grid") !== -1
                    );
                });
                oTable = aTables && aTables.length > 0 ? aTables[0] : null;
            }
            
            if (oTable && !this._bListenerAdded) {
                if (oTable.attachSelectionChange) {
                    oTable.attachSelectionChange(this._updateSendMailButtonState, this);
                    this._bListenerAdded = true;
                    console.log("✅ Selection listener added to table:", oTable.getId());
                }
                
                // ✅ Update button state ngay lần đầu
                this._updateSendMailButtonState();
            } else if (!oTable) {
                console.warn("⚠️ Table not found in view");
            }
        },

        // ✅ Update trạng thái nút Send Mail
        _updateSendMailButtonState: function () {
            try {
                let aContexts = [];
                try {
                    aContexts = this.extensionAPI.getSelectedContexts();
                } catch (e) {
                    console.warn("Error getting selected contexts:", e);
                    return;
                }

                // ✅ Không có row được select
                if (!aContexts || aContexts.length === 0) {
                    this._setSendMailButtonEnabled(false, "Please select a requisition");
                    return;
                }

                // ✅ Lấy dữ liệu từ row được chọn
                const oContext = aContexts[0];
                const oData = oContext.getProperty();
                
                console.log("📊 Selected data:", oData);

                // ✅ Kiểm tra trạng thái từ field "Status"
                const sStatus = oData.Status || "";
                const sStatusText = oData.StatusText || "";
                
                console.log("📌 Current Status Code:", sStatus, "| Status Text:", sStatusText);

                // ✅ Disable nút nếu status là "Reject" (Status Code = 3)
                // Status mapping: 1=Active, 2=Inactive, 3=Reject, 4=Accept, 5=Done, 6=Hiring, 7=Pending
                const bIsRejected = sStatus === 3 || 
                                   sStatus === "3" || 
                                   sStatusText.toUpperCase().includes("REJECT");
                
                if (bIsRejected) {
                    this._setSendMailButtonEnabled(false, "Cannot send email for rejected requisitions");
                    return;
                }

                // ✅ Enable nút nếu status OK
                this._setSendMailButtonEnabled(true, "");

            } catch (e) {
                console.error("❌ Error in _updateSendMailButtonState:", e);
            }
        },

        // ✅ Set trạng thái button
        _setSendMailButtonEnabled: function (bEnabled, sTooltip) {
            try {
                const oView = this.getView();
                
                // ✅ Tìm button bằng ID hoặc custom data
                let oButton = null;
                
                // Cách 1: Tìm bằng data-action (nếu button có data attribute)
                const $buttons = oView.$().find("[data-action='sendMailAction']");
                if ($buttons.length > 0) {
                    oButton = sap.ui.getCore().byId($buttons.attr("id"));
                }
                
                // Cách 2: Tìm button trong toolbar
                if (!oButton) {
                    const oToolbar = oView.byId("CustomActions");
                    if (oToolbar && oToolbar.getContent) {
                        oButton = oToolbar.getContent().find(ctrl => 
                            ctrl.getId && ctrl.getId().includes("sendMailAction")
                        );
                    }
                }
                
                // Cách 3: Tìm tất cả buttons và lọc
                if (!oButton) {
                    const aAllControls = oView.findAggregatedObjects(true, (ctrl) => {
                        return ctrl.getId && ctrl.getId().includes("sendMailAction");
                    });
                    if (aAllControls && aAllControls.length > 0) {
                        oButton = aAllControls[0];
                    }
                }

                if (oButton) {
                    oButton.setEnabled(bEnabled);
                    if (sTooltip) {
                        oButton.setTooltip(sTooltip);
                    }
                    console.log(`✅ Button state updated - Enabled: ${bEnabled}`);
                } else {
                    console.warn("⚠️ Send Mail button not found in view");
                }
                
            } catch (e) {
                console.error("❌ Error setting button state:", e);
            }
        },

        // ✅ Handler nút Send Mail
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

            // ✅ Double-check trạng thái trước khi gửi
            const oData = oContext.getProperty();
            const sStatus = oData.Status || "";
            const sStatusText = oData.StatusText || "";
            
            // Status Code 3 = Reject
            const bIsRejected = sStatus === 3 || 
                               sStatus === "3" || 
                               sStatusText.toUpperCase().includes("REJECT");
            
            if (bIsRejected) {
                MessageBox.error("Cannot send email for rejected requisitions");
                return;
            }

            // ✅ Read full data from backend
            const oFullData = await this._readFullDataFromBackend(oContext);

            if (!oFullData) {
                MessageBox.error("Failed to load requisition data");
                return;
            }

            console.log("📥 Full data from backend:", oFullData);

            const sPosition = oFullData.PositionText || "Position";
            const sReqId = oFullData.ReqId || "";
            const sFullName = oFullData.fullName || "Candidate Name";
            const sEmail = oFullData.EmailAddress || "";
            const sDepartment = oFullData.OrgUnitText || "";

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
                const oFileUploader = Fragment.byId(oView.createId("SendMailDialog"), "chooseFileBtn");
                
                if (oFileUploader) {
                    const oDomRef = oFileUploader.getDomRef();
                    const aFiles = oDomRef?.querySelector("input[type='file']")?.files;
                    
                    if (aFiles && aFiles.length > 0) {
                        const oFile = aFiles[0];
                        
                        if (oFile.size > 5242880) {
                            MessageBox.warning("File size exceeds 5MB limit");
                            return;
                        }
                        
                        sFileName = oFile.name;
                        sFileBase64 = await oController._readFileAsBase64(oFile);
                    }
                }
            } catch (err) {
                console.error("❌ Error reading file:", err);
                MessageBox.warning("Error reading file. Continuing without attachment...");
            }

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
                            const result = reader.result;
                            const base64 = result.indexOf(",") > -1 ? result.split(",")[1] : result;
                            resolve(base64);
                        } catch (err) {
                            reject(err);
                        }
                    };
                    
                    reader.onerror = function () {
                        reject(reader.error);
                    };
                    
                    reader.readAsDataURL(file);
                    
                } catch (err) {
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

                const oModel = this.getOwnerComponent().getModel();
                
                const oKey = this._oCurrentContext.getProperty();
                const sReqId = oKey.ReqId;
                const sApplicantId = oKey.ApplicantId;

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

                oModel.refreshSecurityToken(
                    function (oResponse) {
                        oModel.callFunction(sActionPath, {
                            method: "POST",
                            urlParameters: oPayload,
                            bUrlEncoded: false,
                            success: function (oResponse) {
                                BusyIndicator.hide();

                                if (oResponse && oResponse.sendMail) {
                                    MessageToast.show("Email sent successfully!");

                                    if (oController._pSendMailDialog) {
                                        oController._pSendMailDialog.then(function (dlg) {
                                            dlg.close();
                                        }).catch(function (err) {
                                            console.error("Error closing dialog:", err);
                                        });
                                    }

                                    if (oController.extensionAPI && oController.extensionAPI.refresh) {
                                        oController.extensionAPI.refresh();
                                    }

                                    // ✅ Update button state sau khi refresh
                                    oController._updateSendMailButtonState();
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