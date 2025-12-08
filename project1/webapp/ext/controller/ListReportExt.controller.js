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
            this.getView().attachAfterRendering(this._setupSelectionListener, this);
        },

        _setupSelectionListener: function () {
            const oView = this.getView();
            let oTable = oView.byId("Requisition");
            if (!oTable) {
                oTable = oView.byId("ListReport-Requisition");
            }
            if (!oTable) {
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
                this._updateSendMailButtonState();
            } else if (!oTable) {
                console.warn("⚠️ Table not found in view");
            }
        },

        _updateSendMailButtonState: function () {
            try {
                let aContexts = [];
                try {
                    aContexts = this.extensionAPI.getSelectedContexts();
                } catch (e) {
                    console.warn("Error getting selected contexts:", e);
                    return;
                }

                if (!aContexts || aContexts.length === 0) {
                    this._setSendMailButtonEnabled(false, "Please select a requisition");
                    return;
                }

                const oContext = aContexts[0];
                const oData = oContext.getProperty();
                
                console.log("📊 Selected data:", oData);

                const sStatus = oData.Status || "";
                const sStatusText = oData.StatusText || "";
                
                console.log("📌 Current Status Code:", sStatus, "| Status Text:", sStatusText);

                const bIsRejected = sStatus === 3 || 
                                   sStatus === "3" || 
                                   sStatusText.toUpperCase().includes("REJECT");
                
                if (bIsRejected) {
                    this._setSendMailButtonEnabled(false, "Cannot send email for rejected requisitions");
                    return;
                }

                this._setSendMailButtonEnabled(true, "");

            } catch (e) {
                console.error("❌ Error in _updateSendMailButtonState:", e);
            }
        },

        _setSendMailButtonEnabled: function (bEnabled, sTooltip) {
            try {
                const oView = this.getView();
                let oButton = null;
                
                const $buttons = oView.$().find("[data-action='sendMailAction']");
                if ($buttons.length > 0) {
                    oButton = sap.ui.getCore().byId($buttons.attr("id"));
                }
                
                if (!oButton) {
                    const oToolbar = oView.byId("CustomActions");
                    if (oToolbar && oToolbar.getContent) {
                        oButton = oToolbar.getContent().find(ctrl => 
                            ctrl.getId && ctrl.getId().includes("sendMailAction")
                        );
                    }
                }
                
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

            const oData = oContext.getProperty();
            const sStatus = oData.Status || "";
            const sStatusText = oData.StatusText || "";
            
            const bIsRejected = sStatus === 3 || 
                               sStatus === "3" || 
                               sStatusText.toUpperCase().includes("REJECT");
            
            if (bIsRejected) {
                MessageBox.error("Cannot send email for rejected requisitions");
                return;
            }

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

            const sEmailContentPlainText = this._generatePlainTextEmailTemplate(sFullName, sPosition);

            const oDialogData = {
                ReqId: sReqId,
                FullName: sFullName,
                Position: sPosition,
                Email: sEmail,
                Department: sDepartment,
                Subject: "Job Offer Letter – Tech E Company",
                EmailContent: sEmailContentPlainText
            };

            this._openSendMailDialog(oDialogData);
        },

        // ✅ Generate Plain Text Email Template - Hiển thị trên màn hình
        _generatePlainTextEmailTemplate: function(sFullName, sPosition) {
            return `Dear Mr/Ms ${sFullName},

Thank you for your interest in our recruitment and for applying to Tech E. We highly appreciate the knowledge and enthusiasm you demonstrated during the interview process. Therefore, Tech E is pleased to formally extend an offer of employment with the following details:

- Position: ${sPosition}
- Work Location: .........
- Start Date: .........
- Probation Period: ......... - .........

Details regarding the position, responsibilities, and benefits are outlined in the Job Offer Letter (attached file).

Before your start date, please complete the "Employee Information Form" (attached file) and submit it via this email thread (before the evening of your start date). On your first day, please bring your ID card for building check-in, your personal laptop (You will be provided with a company laptop following company procedures as soon as possible), and required HR documents (attached file).

If you have any questions regarding this information, please contact: ......... (Phone: .........)

We are very proud to welcome a dedicated and talented team member to our organization. Tech E looks forward to receiving your confirmation soon. Let's get ready to achieve our goals together!

Best regards,

---

TECH E COMPANY
Address: .........

Email: .........
Hotline: .........`;
        },

        // ✅ Convert Plain Text to HTML - Khi gửi (VTVlive Style Format)
        _convertPlainTextToHTML: function(sPlainText) {
            // Escape HTML characters
            let sHTML = sPlainText
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

            // Convert line breaks
            sHTML = sHTML.replace(/\n/g, "<br>");

            return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Job Offer Letter - Tech E</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            margin: 0; 
            padding: 0; 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f5f5;
            line-height: 1.6;
        }
        .email-container { 
            max-width: 650px; 
            margin: 20px auto; 
            background-color: #ffffff;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        /* Header với gradient xanh dương đậm */
        .header { 
            background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
            padding: 40px 30px;
            text-align: left;
            color: #ffffff;
            position: relative;
        }
        .header-logo {
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 8px;
            letter-spacing: 1px;
        }
        .header-subtitle {
            font-size: 11px;
            letter-spacing: 2px;
            text-transform: uppercase;
            opacity: 0.95;
            text-align: right;
            margin-top: -25px;
        }
        
        /* Content area */
        .content { 
            padding: 35px 30px;
            background-color: #ffffff;
        }
        
        /* Title section với style italic màu xanh */
        .title-section {
            font-family: Georgia, 'Times New Roman', serif;
            font-size: 32px;
            color: #1e3a8a;
            font-style: italic;
            margin-bottom: 25px;
            font-weight: 500;
        }
        
        /* Greeting */
        .greeting {
            color: #000000;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 20px;
        }
        
        /* Paragraph text */
        .text-content {
            color: #333333;
            font-size: 14px;
            line-height: 1.8;
            margin-bottom: 18px;
            text-align: justify;
        }
        
        /* Job details list */
        .job-details {
            margin: 25px 0;
            padding-left: 20px;
        }
        .job-details li {
            color: #333333;
            font-size: 14px;
            line-height: 1.9;
            margin-bottom: 8px;
            list-style: none;
            position: relative;
            padding-left: 10px;
        }
        .job-details li:before {
            content: "-";
            position: absolute;
            left: -10px;
            font-weight: bold;
            color: #1e3a8a;
        }
        
        /* Highlight text */
        .highlight {
            font-weight: 600;
            color: #1e3a8a;
        }
        
        /* Decoration với text "Best regards!" */
        .decoration {
            text-align: right;
            margin: 30px 0 20px 0;
            position: relative;
        }
        .decoration-text {
            color: #ea580c;
            font-size: 20px;
            font-weight: 600;
            font-style: italic;
        }
        
        /* Footer với gradient xanh dương đậm */
        .footer {
            background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
            padding: 30px;
            color: #ffffff;
            text-align: center;
        }
        .footer-title {
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            margin-bottom: 15px;
        }
        .footer-address {
            font-size: 11px;
            line-height: 1.6;
            margin-bottom: 12px;
            opacity: 0.95;
        }
        .footer-contact {
            font-size: 11px;
            margin-top: 8px;
        }
        .footer-contact span {
            margin: 0 10px;
        }
        
        /* Signature */
        .signature {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
        }
        .signature-line {
            color: #333333;
            font-size: 14px;
            margin: 3px 0;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="header">
            <div class="header-logo">Tech E</div>
            <div class="header-subtitle">HUMAN RESOURCES<br>DEPARTMENT</div>
        </div>
        
        <!-- Content -->
        <div class="content">
            <h1 class="title-section">Job Offer Letter</h1>
            
            ${this._formatEmailContentHTML(sHTML)}
            
            <!-- Decoration -->
            <div class="decoration">
                <span class="decoration-text">Best regards!</span>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <div class="footer-title">TECH E COMPANY</div>
            
        </div>
    </div>
</body>
</html>`;
        },

        // ✅ Format email content với style VTVlive
        _formatEmailContentHTML: function(sContent) {
            const lines = sContent.split("<br>");
            let result = [];
            let inJobDetails = false;

            lines.forEach((line) => {
                const text = line.trim();
                
                if (!text || text === "---") {
                    return;
                }

                // Greeting: "Dear Mr/Ms..."
                if (text.startsWith("Dear")) {
                    result.push(`<p class="greeting">${text}</p>`);
                }
                // Job details list (bắt đầu với dấu -)
                else if (text.startsWith("-")) {
                    if (!inJobDetails) {
                        result.push(`<ul class="job-details">`);
                        inJobDetails = true;
                    }
                    const cleanText = text.substring(1).trim();
                    result.push(`<li>${cleanText}</li>`);
                }
                // End job details list
                else if (inJobDetails && !text.startsWith("-")) {
                    result.push(`</ul>`);
                    inJobDetails = false;
                    result.push(`<p class="text-content">${text}</p>`);
                }
                // Contact info (có Phone/Contact)
                else if (text.includes("contact:") || text.includes("Phone:") || text.includes("questions")) {
                    result.push(`<p class="text-content highlight">${text}</p>`);
                }
                // Footer company info
                else if (text.includes("TECH E COMPANY") || text.includes("Address:") || 
                         text.includes("Email:") || text.includes("Hotline:")) {
                    if (!result[result.length - 1]?.includes("signature")) {
                        result.push(`<div class="signature">`);
                    }
                    result.push(`<p class="signature-line">${text}</p>`);
                }
                // Best regards
                else if (text.includes("Best regards")) {
                    result.push(`<p class="text-content" style="margin-top: 25px;">${text}</p>`);
                }
                // Regular content
                else {
                    result.push(`<p class="text-content">${text}</p>`);
                }
            });

            // Close any open tags
            if (inJobDetails) {
                result.push(`</ul>`);
            }
            if (result[result.length - 1]?.includes("signature-line")) {
                result.push(`</div>`);
            }

            return result.join("\n");
        },

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
                        const sHTMLContent = oController._convertPlainTextToHTML(sContent);
                        oController._sendEmailViaFM(sEmail, sSubject, sHTMLContent, sFileName, sFileBase64);
                    }
                }
            });
        },

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

        _isValidEmail: function (sEmail) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(sEmail);
        },

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