sap.ui.define(
  [
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/json/JSONModel",
  ],
  function (
    MessageToast,
    MessageBox,
    Fragment,
    ControllerExtension,
    Filter,
    FilterOperator,
    JSONModel
  ) {
    "use strict";
    return {
      _oRequisitionContext: null,
      _oUploadDialog: null,
      _selectedFile: null,

      UploadFile: function (oEvent) {
        var oView = this.getView();
        var oBindingContext = oView.getBindingContext();
        var oData = oBindingContext ? oBindingContext.getObject() : null;
        console.log("UploadFile called. Binding context data:", oData);
        var oReqId = oData ? oData.ReqId : null;
        if (!oReqId) {
          MessageBox.error("Please create requisition first.");
          return;
        }

        this._oRequisitionContext = oBindingContext;
        this._openUploadDialog();
      },

      _openUploadDialog: function () {
        var oView = this.getView();

        if (!this._oUploadDialog) {
          Fragment.load({
            id: oView.getId(),
            name: "create.ext.fragments.uploadFile",
            controller: this,
          }).then(
            function (oDialog) {
              this._oUploadDialog = oDialog;
              oView.addDependent(oDialog);
              this._oUploadDialog.open();
            }.bind(this)
          );
        } else {
          this._oUploadDialog.open();
        }
      },

      onFileChange: function (oEvent) {
        var oFileUploader = oEvent.getSource();
        var oFile =
          oEvent.getParameter("files") && oEvent.getParameter("files")[0];
        console.log("Selected file:", oFile);
        if (oFile) {
          this._selectedFile = oFile;

          var sMimeType = oFile.type;
          if (sMimeType !== "application/pdf") {
            MessageBox.warning("Only PDF files are allowed.");
            oFileUploader.clear();
            this._selectedFile = null;
            return;
          }

          var iMaxFileSize = 5 * 1024 * 1024; // 10MB
          console.log("Max file size:", iMaxFileSize);
          if (oFile.size > iMaxFileSize) {
            console.log("File size:", oFile.size);
            MessageBox.warning("File size exceeds 10MB limit.");
            oFileUploader.clear();
            this._selectedFile = null;
            return;
          }

          MessageToast.show("File selected: " + oFile.name);
        }
      },

      onUploadPress: function () {
        if (!this._selectedFile) {
          MessageBox.warning("Please select a file first.");
          return;
        }

        if (!this._oRequisitionContext) {
          MessageBox.error("No requisition context found.");
          return;
        }

        var that = this;
        var oFile = this._selectedFile;

        console.log("Uploading file:", oFile.name, oFile.type, oFile.size);

        var oFileReader = new FileReader();

        oFileReader.onload = function (e) {
          var content = e.target.result;
          // Loại bỏ data URL prefix (data:application/pdf;base64,)
          // var sBase64Content = content.split(",")[1];

          var oData = that._oRequisitionContext.getObject();
          var sReqId = oData.ReqId;
          var sApplicantId = oData.ApplicantId;

          console.log("base64 content:", content);
          that._callUploadAction(
            sReqId,
            sApplicantId,
            oFile.name,
            oFile.type,
            content,
            oFile.size,
            oFile
          );

          // that._uploadBinaryFile(
          //   sReqId,
          //   sApplicantId,
          //   oFile.name,
          //   oFile.type,
          //   sBase64Content
          // );
        };

        oFileReader.onerror = function () {
          MessageBox.error("Error reading file.");
        };

        oFileReader.readAsArrayBuffer(oFile);
      },

      /**
       * ✅ Gọi FunctionImport uploadFile
       * QUAN TRỌNG: Phải truyền keys của Z4C_APP_ATTACH entity
       */
      _callUploadAction: function (
        sReqId,
        sApplicantId,
        sFileName,
        sMimeType,
        sBase64Content,
        sSize,
        oFile
      ) {
        var oModel = this.getView().getModel();
        var that = this;
        // this._oUploadDialog.setBusy(true);

        var slug = sReqId + "/" + sApplicantId + "/" + sFileName + "/" + sSize;
        console.log("Slug header:", slug);
        var oPayload = {
          ReqID: sReqId,
          ApplicantId: sApplicantId,
          AttachID: "",
          MIMEType: sMimeType || "application/octet-stream",
          FileContent: sBase64Content,
          FileSize: sSize,
        };

        var oFormData = new FormData();
        oFormData.append("file", oFile);

        // Upload file
        jQuery.ajax({
          url: "/sap/opu/odata/SAP/ZFILE_EX_SRV/FileSet",
          type: "POST",
          data: oFormData,
          processData: false,
          contentType: false,
          headers: {
            // "X-CSRF-Token": sToken,
            "Content-Type": "application/pdf",
            slug: slug,
          },
          success: function (data) {
            this.getView().setBusy(false);
            this.onCloseUploadDialog();
            MessageBox.success("Upload file thành công!", {
              onClose: function () {}.bind(this),
            });
          }.bind(this),
          error: function (error) {
            this.getView().setBusy(false);
            this.onCloseUploadDialog();
            var sErrorMsg = "Upload file thất bại!";

            if (error.responseJSON && error.responseJSON.error) {
              sErrorMsg += "\n" + error.responseJSON.error.message.value;
            }

            MessageBox.error(sErrorMsg);
          }.bind(this),
        });

        this.getView().setBusy(false);
      },

      _getCSRFToken: function () {
        return new Promise(function (resolve, reject) {
          jQuery.ajax({
            url: "/sap/opu/odata/SAP/ZFILE_EX_SRV/",
            type: "GET",
            headers: {
              "X-CSRF-Token": "Fetch",
            },
            success: function (data, textStatus, xhr) {
              var sToken = xhr.getResponseHeader("X-CSRF-Token");
              resolve(sToken);
            },
            error: function (error) {
              reject(error);
            },
          });
        });
      },

      _refreshAttachments: function () {
        if (this._oRequisitionContext) {
          // Refresh context
          this._oRequisitionContext.refresh(true);

          // Refresh attachment table/list
          var oAttachmentTable = this.byId("attachmentTable");
          if (oAttachmentTable && oAttachmentTable.getBinding("items")) {
            oAttachmentTable.getBinding("items").refresh();
          }
        }
      },

      onCloseUploadDialog: function () {
        if (this._oUploadDialog) {
          this._oUploadDialog.close();

          var oFileUploader = this.byId("fileUploader");
          if (oFileUploader) {
            oFileUploader.clear();
          }
          this._selectedFile = null;
        }
      },

      onExit: function () {
        if (this._oUploadDialog) {
          this._oUploadDialog.destroy();
        }
      },

      // ✅ THÊM: Handle upload complete
      onUploadComplete: function (oEvent) {
        if (this._oUploadDialog) {
          this._oUploadDialog.setBusy(false);
        }

        var sResponse = oEvent.getParameter("response");
        var iStatus = oEvent.getParameter("status");

        if (iStatus === 200 || iStatus === 201) {
          MessageToast.show("File uploaded successfully!");

          if (this._oUploadDialog) {
            this._oUploadDialog.close();
          }

          // Refresh attachments
          this._refreshAttachments();
        } else {
          var sErrorMsg = "Failed to upload file.";
          try {
            var oResponse = JSON.parse(sResponse);
            if (oResponse.error && oResponse.error.message) {
              sErrorMsg = oResponse.error.message.value;
            }
          } catch (e) {
            // Use default error message
          }
          MessageBox.error(sErrorMsg);
        }

        // Clear header parameters
        var oFileUploader = oEvent.getSource();
        oFileUploader.removeAllHeaderParameters();
      },
      simulate: function (oEvent) {
        var that = this;
        var oView = this.getView();
        var oModel = oView.getModel();
        var oBindingContext = oView.getBindingContext();

        if (!oBindingContext) {
          sap.m.MessageBox.error("Không tìm thấy dữ liệu yêu cầu");
          return;
        }

        var sPath = oBindingContext.getPath();
        var oData = oModel.getProperty(sPath);
        console.log("Requisition data:", oData);

        if (!oData.ApplicantId) {
          sap.m.MessageBox.error("Applicant ID is required for simulation");
          return;
        }

        if (!oData.PersArea || !oData.PositionId) {
          sap.m.MessageBox.error(
            "Personnel Area and Position ID are required for simulation"
          );
          return;
        }

        if (!oData.BasicSalary || !oData.BonusSalary) {
          sap.m.MessageBox.error(
            "Basic Salary and Bonus Salary are required for simulation"
          );
          return;
        }

        var mParameters = {
          ReqId: "",
          ApplicantId: oData.ApplicantId,
          basic_sal: oData.BasicSalary,
          bonus_sal: oData.BonusSalary,
          pers_area: oData.PersArea,
          position_id: oData.PositionId,
        };

        console.log(mParameters);
        sap.ui.core.BusyIndicator.show(0);

        oModel.callFunction("/simulateRequisition", {
          method: "POST",
          urlParameters: mParameters,
          success: function (oResponse) {
            sap.ui.core.BusyIndicator.hide();

            var aApprovers = oResponse.results || [];
            console.log("Approver list:", aApprovers);

            if (aApprovers.length > 0) {
              that._showApproverDialog(aApprovers, oData);
            } else {
              sap.m.MessageBox.information("Cannot find approver");
            }
          },
          error: function (oError) {
            sap.ui.core.BusyIndicator.hide();

            var sMessage = "Error simulating requisition";
            if (oError.responseText) {
              try {
                var oErrorData = JSON.parse(oError.responseText);
                sMessage = oErrorData.error.message.value || sMessage;
              } catch (e) {
                console.error(e);
              }
            }

            sap.m.MessageBox.error(sMessage);
          },
        });
      },

      _showApproverDialog: function (aApprovers, oReqData) {
        var that = this;
        var oView = this.getView();

        // Prepare data object
        var oDialogData = {
          reqId: oReqData.ReqId,
          applicantName: oReqData.ApplicantName || oReqData.ApplicantId,
          totalSteps: aApprovers.length,
          approvers: aApprovers,
        };

        // Load fragment if not exists
        if (!this._oApproverDialog) {
          Fragment.load({
            id: oView.getId(),
            name: "create.ext.fragments.ApproverListDialog",
            controller: this,
          })
            .then(function (oDialog) {
              that._oApproverDialog = oDialog;
              oView.addDependent(that._oApproverDialog);

              // Create JSONModel using sap.ui.require
              sap.ui.require(
                ["sap/ui/model/json/JSONModel"],
                function (JSONModel) {
                  var oViewModel = new JSONModel(oDialogData);
                  that._oApproverDialog.setModel(oViewModel, "viewModel");
                  that._oApproverDialog.open();
                }
              );
            })
            .catch(function (oError) {
              MessageBox.error("Error loading dialog: " + oError.message);
            });
        } else {
          // Update existing model
          sap.ui.require(["sap/ui/model/json/JSONModel"], function (JSONModel) {
            var oViewModel = new JSONModel(oDialogData);
            that._oApproverDialog.setModel(oViewModel, "viewModel");
            that._oApproverDialog.open();
          });
        }
      },

      onCloseApproverDialog: function () {
        if (this._oApproverDialog) {
          this._oApproverDialog.close();
        }
      },

      // onSearchApprover: function (oEvent) {
      //   var sQuery = oEvent.getParameter("query");
      //   var oTable = this.byId("approverTable");
      //   var oBinding = oTable.getBinding("items");

      //   if (!oBinding) {
      //     return;
      //   }

      //   var aFilters = [];
      //   if (sQuery) {
      //     aFilters.push(
      //       new sap.ui.model.Filter({
      //         filters: [
      //           new sap.ui.model.Filter(
      //             "per_id",
      //             sap.ui.model.FilterOperator.Contains,
      //             sQuery
      //           ),
      //           new sap.ui.model.Filter(
      //             "per_acc",
      //             sap.ui.model.FilterOperator.Contains,
      //             sQuery
      //           ),
      //           new sap.ui.model.Filter(
      //             "pos_id",
      //             sap.ui.model.FilterOperator.Contains,
      //             sQuery
      //           ),
      //           new sap.ui.model.Filter(
      //             "seq_no",
      //             sap.ui.model.FilterOperator.Contains,
      //             sQuery
      //           ),
      //         ],
      //         and: false,
      //       })
      //     );
      //   }

      //   oBinding.filter(aFilters);
      // },

      // onExportApprovers: function () {
      //   var oModel = this._oApproverDialog.getModel("viewModel");
      //   var aApprovers = oModel.getProperty("/approvers");

      //   if (!aApprovers || aApprovers.length === 0) {
      //     MessageToast.show("No data to export");
      //     return;
      //   }

      //   // Prepare export data
      //   var aExportData = aApprovers.map(function (oApprover) {
      //     return {
      //       Step: oApprover.seq_no,
      //       "Person ID": oApprover.per_id,
      //       "Person Account": oApprover.per_acc,
      //       "Position ID": oApprover.pos_id,
      //     };
      //   });

      //   // Export to Excel
      //   this._exportToExcel(aExportData, "Approver_List");
      // },

      // _exportToExcel: function (aData, sFileName) {
      //   sap.ui.require(["sap/ui/export/Spreadsheet"], function (Spreadsheet) {
      //     var aCols = Object.keys(aData[0]).map(function (sKey) {
      //       return {
      //         label: sKey,
      //         property: sKey,
      //         type: "String",
      //       };
      //     });

      //     var oSettings = {
      //       workbook: {
      //         columns: aCols,
      //         hierarchyLevel: "Level",
      //       },
      //       dataSource: aData,
      //       fileName: sFileName + ".xlsx",
      //       worker: false,
      //     };

      //     var oSpreadsheet = new Spreadsheet(oSettings);
      //     oSpreadsheet
      //       .build()
      //       .then(function () {
      //         MessageToast.show("Excel file exported successfully");
      //       })
      //       .catch(function (sError) {
      //         MessageBox.error("Error exporting file: " + sError);
      //       });
      //   });
      // },
    };
  }
);
