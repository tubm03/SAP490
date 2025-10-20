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

        /* =========================================================== */
        /* Handle SendMail Action                                       */
        /* =========================================================== */

        // Handler được gọi khi click nút "Send Mail" từ toolbar
        beforeSendMail: function (oEvent) {
            console.log("🟢 beforeSendMail called");
            console.log("Event:", oEvent);

            // Get selected context
            let aContexts = [];
            
            try {
                aContexts = this.extensionAPI.getSelectedContexts();
            } catch (e) {
                console.error("Error getting contexts:", e);
            }

            console.log("Selected contexts:", aContexts);

            if (!aContexts || aContexts.length === 0) {
                MessageBox.warning("Please select a requisition");
                return;
            }

            const oContext = aContexts[0];
            const sPosition = oContext.getProperty("Position") || "Position";
            const sReqId = oContext.getProperty("ReqId");

            const sEmailContent = `Dear {{CandidateName}},

Thank you for taking the time to participate in our recruitment process at {{CompanyName}}.

We are pleased to inform you that you have been selected for the position of ${sPosition}.

Your expected start date is .........., and more details will be shared shortly.

We will send your official Offer Letter to this email address soon.

Best regards,
HR Department
{{CompanyName}}`;

            const oData = {
                ReqId: sReqId,
                FullName: "Candidate Name",
                Position: sPosition,
                Email: "candidate@example.com",
                EmailContent: sEmailContent
            };

            this._oCurrentContext = oContext;
            this._openSendMailDialog(oData);
        },

        // Open Send Mail Dialog
        _openSendMailDialog: function (oData) {
            console.log("🟢 Opening SendMailDialog fragment...");
            const oView = this.getView();

            const openDialog = (oDialog) => {
                const oDialogModel = new JSONModel(oData);
                oDialog.setModel(oDialogModel, "dialog");
                oDialog.open();
                console.log("✅ Send Mail Dialog opened");
            };

            if (this._oSendMailDialog) {
                openDialog(this._oSendMailDialog);
                return;
            }

            Fragment.load({
                id: oView.getId(),
                name: "project1.ext.fragments.SendMailDialog",
                controller: this
            }).then((oDialog) => {
                this._oSendMailDialog = oDialog;
                oView.addDependent(oDialog);
                openDialog(oDialog);
            }).catch((err) => {
                console.error("❌ Failed to load fragment:", err);
                MessageBox.error("Failed to load Send Mail dialog.");
            });
        },

        onSendEmailConfirm: function () {
            const oView = this.getView();
            const sEmail = Fragment.byId(oView.getId(), "emailInput").getValue();
            const sContent = Fragment.byId(oView.getId(), "emailContentArea").getValue();

            if (!sEmail) {
                MessageBox.warning("Please enter email address");
                return;
            }

            MessageBox.confirm(`Send email to: ${sEmail}?`, {
                title: "Confirm Send",
                onClose: (oAction) => {
                    if (oAction === MessageBox.Action.OK) {
                        BusyIndicator.show(0);

                        // Call backend RAP action here
                        const oModel = oView.getModel();
                        const sPath = this._oCurrentContext.getPath();
                        
                        oModel.callFunction(sPath + "/sendMail", {
                            method: "POST",
                            urlParameters: {
                                Email: sEmail,
                                EmailContent: sContent
                            },
                            success: (oResponse) => {
                                BusyIndicator.hide();
                                MessageToast.show("Email sent successfully");
                                this._oSendMailDialog.close();
                            },
                            error: (oError) => {
                                BusyIndicator.hide();
                                console.error("Error:", oError);
                                MessageBox.error("Failed to send email");
                            }
                        });
                    }
                }
            });
        },

        onCancelSendMail: function () {
            if (this._oSendMailDialog) {
                this._oSendMailDialog.close();
            }
        }
    };
});