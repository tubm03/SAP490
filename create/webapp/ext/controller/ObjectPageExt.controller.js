sap.ui.define(
  [
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/core/Fragment",
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/mvc/ControllerExtension",
  ],
  function (MessageToast, MessageBox, Fragment, ControllerExtension) {
    "use strict";

    return {
      _oRequisitionContext: null,
      _oUploadDialog: null,
      _selectedFile: null,

      override: {
        onInit: function () {
          // Get the view and set up binding context change listener
          var oView = this.getView();
          oView.attachEventOnce(this._setButtonVisibility, this);
        },
      },

      // Method to set button visibility based on ReqId
      _setButtonVisibility: function () {
        var oView = this.getView();
        var oBindingContext = oView.getBindingContext();
        var oUploadButton = oView.byId("action::uploadFileButton");
        if (oBindingContext) {
          var oData = oBindingContext.getObject();
          if (!oData) {
            oUploadButton.setVisible(true);
          } else {
            oUploadButton.setVisible(false);
          }
        }
      },

      // Alternative approach: Control visibility dynamically
      onBeforeRendering: function () {
        this._setButtonVisibility();
      },

      UploadFile: function (oEvent) {
        var oView = this.getView();
        var oBindingContext = oView.getBindingContext();

        if (!oBindingContext) {
          MessageBox.error("Please select a requisition first.");
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

          var iMaxFileSize = 10 * 1024 * 1024; // 10MB
          if (oFile.size > iMaxFileSize) {
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
    };
  }
);
