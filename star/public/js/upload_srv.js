/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.service('nb_upload', Uploader);

	function Uploader() {
		this.upload_id_idx = 0;
		this.uploads = {};
	}

	Uploader.prototype.has_uploads = function() {
		return !_.isEmpty(this.uploads);
	};

	Uploader.prototype.add_upload = function(event, data) {
		// create the upload object and connect to uploads list,
		var file = data.files[0];
		var idx = this.upload_id_idx;
		var upload = {
			idx: idx,
			dir_inode: dir_inode,
			data: data,
			file: file,
			working: true,
			progress: 0,
			status: 'Creating...',
			row_class: '',
			progress_class: 'progress-bar progress-bar-success',
		};
		// link the upload object on the data to propagate progress
		data.upload_idx = idx;
		this.upload_id_idx++;
		this.uploads[idx] = upload;
		num_running_uploads++;

		function upload_success() {
			num_running_uploads--;
			upload.status = 'Completed';
			upload.row_class = 'success';
			upload.working = false;
			dir_inode.read_dir();
			$scope.safe_apply();
		}

		function upload_failed() {
			num_running_uploads--;
			upload.status = 'Failed!';
			upload.row_class = 'danger';
			upload.progress_class = 'progress-bar progress-bar-danger';
			upload.progress = 100;
			upload.working = false;
			dir_inode.read_dir();
			$scope.safe_apply();
		}
		upload.upload_failed = upload_failed; // expose for user cancel request

		// create the file and receive upload location info
		console.log('creating file:', file);
		var ev = dir_inode.mkfile(file.name, file.size, file.type, file.webkitRelativePath);
		ev.on('success', function(mkfile_data) {
			upload.inode_id = mkfile_data.id;
			upload.status = 'Uploading...';
			// using s3 upload with signed url
			data.type = 'POST';
			data.multipart = true;
			data.url = mkfile_data.s3_post_info.url;
			data.formData = mkfile_data.s3_post_info.form;
			console.log('MKFILE:', mkfile_data, data);
			upload.xhr = data.submit();
			upload.xhr.success(function(result, textStatus, jqXHR) {
				console.log('[ok] upload success');
				upload.status = 'Finishing...';
				delete upload.last_star_update;
				$scope.safe_apply();
				// update the file state to uploading=false
				return $scope.http({
					method: 'PUT',
					url: $scope.inode_api_url + mkfile_data.id,
					data: {
						uploading: false
					}
				}).on('success', upload_success)
					.on('error', upload_failed);
			});
			upload.xhr.error(function(jqXHR, textStatus, errorThrown) {
				console.error('upload error: ' + textStatus + ' ' + errorThrown, jqXHR.responseText);
				upload_failed();
			});
			$scope.safe_apply();
		});
		ev.on('error', function(data) {
			console.log('Failed in creation: ', data);
			upload_failed();
			$scope.safe_apply();
		});
		$scope.safe_apply();
	};

	$scope.update_progress = function(event, data) {
		var upload = $scope.uploads[data.upload_idx];
		upload.progress = parseInt(data.loaded / data.total * 100, 10);
		$scope.safe_apply();
		/* not really needed for now
		//in order to make sure we don't overload the DB, we'll limit update per 10sec
		var curr_time = new Date();
		if (!upload.last_star_update) {
			upload.last_star_update = curr_time;
		}
		if (curr_time - upload.last_star_update >= 10 * 1000) {
			//As this is updating the DB on the progress, there is little that can be done
			//except for logging. 
			upload.last_star_update = curr_time;
			return $scope.http({
				method: 'PUT',
				url: $scope.inode_api_url + upload.inode_id,
				data: {
					upsize: upload.data._progress.loaded,
					uploading: true
				}
			}).on('success', function() {
				$scope.safe_apply();
			});
		}
*/
	};

	$scope.dismiss_upload = function(upload) {
		var do_dismiss = function() {
			if (upload.working) {
				if (upload.xhr) {
					upload.xhr.abort();
				}
			} else {
				delete $scope.uploads[upload.idx];
			}
		};
		if (!upload.working) {
			do_dismiss();
		} else {
			$.nbconfirm('This upload is still working.<br/>' +
				'Are you sure you want to cancel it?', do_dismiss);
		}
	};

	// setup the global file/dir input and link them to this scope
	$('#file_upload_input').fileupload({
		add: $scope.add_upload,
		progress: $scope.update_progress,
		// we want single file per xhr
		singleFileUploads: true,
		// xml is is how amazon s3 work
		dataType: 'xml'
	});

	$('#dir_upload_input').fileupload({
		add: $scope.add_upload,
		progress: $scope.update_progress,
		// we want single file per xhr
		singleFileUploads: true,
		// xml is is how amazon s3 work
		dataType: 'xml',
		// disabling drop/paste, file_upload_input will handle globally,
		// if we don't disable it will upload twice.
		dropZone: null,
		pasteZone: null
	});


})();