// init jquery stuff

var num_running_uploads = 0;

$(function() {
	window.onbeforeunload = function() {
		if (num_running_uploads) {
			return "Leaving this page will interrupt your running Uploads !!!";
		}
	};

	// enable bootstrap tooltips.
	// the container=body is needed due to https://github.com/twitter/bootstrap/issues/5687
	$("[rel=tooltip]").tooltip({
		container: 'body'
	});

	// enable dragging of class draggable
	$(".draggable").draggable({
		helper: "clone"
	});

	$(".selectable").selectable();

	/* 
	// this tries to prevent drop in the window, 
	// but unfortunately it also prevents drop on elements which have their own ondrop event...
	window.addEventListener("dragover", function(e) {
		e = e || event;
		e.preventDefault();
	}, false);
	window.addEventListener("drop", function(e) {
		e = e || event;
		e.preventDefault();
	}, false);
	*/
});

// open the page context menu element on the given mouse event position

function open_context_menu(event) {
	var context_menu = $('#context_menu');
	var context_menu_toggle = $('#context_menu_toggle');
	context_menu.css('position', 'fixed');
	context_menu.css('left', event.clientX);
	context_menu.css('top', event.clientY);
	context_menu_toggle.dropdown('toggle');
}


function sync_property(to, from, key) {
	if (to[key] === from[key]) {
		return;
	}
	if (from[key]) {
		to[key] = from[key];
	} else {
		delete to[key];
	}
}



////////////////////////////////
////////////////////////////////
// Alerts
////////////////////////////////
////////////////////////////////

// Keep list of alerts, and their unread state

function Alerts() {
	this.alerts = [];
	this.num_unread = 0;
}

// push new alert in front of existing ones and increase counter
Alerts.prototype.add = function(text, info) {
	console.error("[ERR]", text, info);
	this.alerts.unshift({
		text: text,
		time: new Date(),
		unread: true
	});
	this.num_unread++;
};

// turn off the unread and reduce counter
Alerts.prototype.mark_read = function(alert) {
	if (alert.unread) {
		this.num_unread--;
		alert.unread = false;
	}
};



////////////////////////////////
////////////////////////////////
// Inode
////////////////////////////////
////////////////////////////////


// Inode model for dir/file

function Inode($scope, id, name, isdir, parent) {

	// link to the scope that serves the inode - 
	// it is used mainly for access to api functions to act on the inode in the server,
	// and also for creating alerts and stuff like these.
	this.$scope = $scope;

	// basic properties
	this.id = id;
	this.name = name;
	this.isdir = isdir;
	this.parent = parent;

	// computed level - better save the result here than call recursive func
	this.level = parent ? (parent.level + 1) : 0;

	// directory state
	if (isdir) {
		this.dir_state = {
			subdirs: {},
			subfiles: {},
			populated: false,
			expanded: false
		};
	}
}

// construct a list of the path of dirs from the root down to this inode.
Inode.prototype.get_path = function() {
	path = [];
	i = this;
	while (i) {
		if (i.parent || !this.$scope.hide_root_dir) {
			path.unshift(i);
		}
		i = i.parent;
	}
	return path;
};

// load_dir will read the dir only if it was not yet populated
Inode.prototype.load_dir = function() {
	if (!this.dir_state.populated) {
		this.read_dir();
	}
};

// expand or collapse this dir, if needed also calls load_dir on expand
Inode.prototype.expand_toggle = function() {
	if (this.dir_state.expanded) {
		this.dir_state.expanded = false;
	} else {
		this.dir_state.expanded = true;
		this.load_dir();
	}
};

// set the expand flag for all parents.
// this can be used to make sure this item will be visible in a tree.
Inode.prototype.expand_path = function() {
	var i = this;
	while (i) {
		i.dir_state.expanded = true;
		i = i.parent;
	}
};

// send readdir request to the server
// readdir will read the dir regardless if it was already populated
// - in such case it will refresh.
// however it will avoid if another readdir is currently working (refreshing),
// and will return the same events object to allow registering handlers.
Inode.prototype.read_dir = function() {
	if (this.dir_state.refreshing) {
		return this.dir_state.refreshing;
	}
	var me = this; // needed for callbacks propagation
	var ev = this.$scope.http({
		method: 'GET',
		url: this.$scope.inode_api_url + this.id
	});
	ev.on('all', function() {
		delete me.dir_state.refreshing;
	});
	ev.on('success', function(data) {
		me.populate_dir(data.entries);
	});
	this.dir_state.refreshing = ev;
	return ev;
};


// insert given entries as sub items under the this directory item
Inode.prototype.populate_dir = function(entries) {
	var subdirs = {};
	var subfiles = {};
	var during_upload = false;
	var ent;
	var son;

	for (var i = 0; i < entries.length; ++i) {
		ent = entries[i];
		if (ent.isdir) {
			son = this.dir_state.subdirs[ent.id];
		} else {
			son = this.dir_state.subfiles[ent.id];
		}
		if (!son) {
			son = new Inode(
				this.$scope,
				ent.id,
				ent.name,
				ent.isdir,
				this);
		}

		// compute entry progress
		if (ent.uploading) {
			if (ent.upsize && ent.size) {
				ent.progress = (ent.upsize * 100 / ent.size) >> 0; // >>0 to make int
			} else {
				ent.progress = 0;
			}
			during_upload = true;
		}

		// sync fields which are mutable
		sync_property(son, this, "$scope");
		sync_property(son, ent, "name");
		sync_property(son, ent, "size");
		sync_property(son, ent, "uploading");
		sync_property(son, ent, "progress");

		if (son.isdir) {
			subdirs[son.id] = son;
		} else {
			subfiles[son.id] = son;
		}
	}
	this.dir_state.subdirs = subdirs;
	this.dir_state.subfiles = subfiles;
	this.dir_state.populated = true;
	this.dir_state.during_upload = during_upload;
	this.$scope.read_dir_callback(this);
};

// create new dir under this dir
Inode.prototype.mkdir = function(name) {
	var me = this;
	return this.$scope.http({
		method: 'POST',
		url: this.$scope.inode_api_url,
		data: {
			id: this.id,
			name: name,
			isdir: true
		}
	}).on('all', function() {
		me.read_dir();
	});
};

// delete this inode
Inode.prototype.delete_inode = function() {
	var me = this;
	var parent = this.parent;
	if (!parent) {
		this.$scope.alerts.add("You shouldn't delete root dir");
		return;
	}
	return this.$scope.http({
		method: 'DELETE',
		url: this.$scope.inode_api_url + this.id
	}).on('all', function() {
		parent.read_dir();
	});
};

// rename this inode to the given target dir,name
Inode.prototype.rename = function(to_parent, to_name) {
	var me = this;
	var parent = this.parent;
	if (!parent) {
		this.$scope.alerts.add("You shouldn't rename root dir");
		return;
	}
	return this.$scope.http({
		method: 'PUT',
		url: this.$scope.inode_api_url + this.id,
		data: {
			parent: to_parent.id,
			name: to_name
		}
	}).on('all', function() {
		to_parent.read_dir();
		parent.read_dir();
	});
};

// send device upload request
Inode.prototype.dev_upload = function(dir_inode) {
	return this.$scope.http({
		method: 'POST',
		url: this.$scope.api_url + 'upload',
		data: {
			id: this.id,
			dir_id: dir_inode.id
		}
	}).on('all', function() {
		dir_inode.read_dir();
	});
};

// open a download window on this file
Inode.prototype.download_file = function() {
	if (this.uploading) {
		return;
	}
	var url = this.$scope.inode_api_url + this.id;
	var win = window.open(url, '_blank');
	win.focus();
	/*
	// removed this code because the browser considered as popup and did blocking
	// so we prefer to open and be redirected by the server.
	return this.$scope.http({
		method: 'GET',
		url: this.$scope.inode_api_url + this.id
	}).on('success', function(data) {
		console.log(data.s3_get_url);
		var win = window.open(data.s3_get_url, '_blank');
		win.focus();
	});
	*/
};

Inode.prototype.mkfile = function(name, size, content_type, relative_path) {
	var me = this;
	return this.$scope.http({
		method: 'POST',
		url: this.$scope.inode_api_url,
		data: {
			id: this.id,
			name: name,
			isdir: false,
			size: size,
			uploading: true,
			content_type: content_type,
			relative_path: relative_path
		}
	}).on('all', function(mkfile_data) {
		me.read_dir();
	});
}

Inode.prototype.get_share_list = function() {
	console.log("In get share list!!!!");
	console.log(this);
	return this.$scope.http({
		method: 'GET',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_share_sufix
	});
};

Inode.prototype.share = function() {
	return this.$scope.http({
		method: 'POST',
		url: this.$scope.api_url + 'share',
		data: {
			id: this.id,
			share_list: share_list
		}
	});
};



////////////////////////////////
////////////////////////////////
// InodesSelection
////////////////////////////////
////////////////////////////////

// simple selection model that has one selected inode,
// and it turns on/off the given tags on the selected inode.

function InodesSelection(tags) {
	this.tags = tags;
	this.inode = null;
}

// change the selection - remove tags from old selection and add to new.
InodesSelection.prototype.select = function(inode) {
	var i, t;
	if (this.inode) {
		// delete tags from previous selection
		for (t in this.tags) {
			delete this.inode[t];
		}
	}
	if (inode) {
		// add tags to selection
		$.extend(inode, this.tags);
	}
	this.inode = inode;
};



////////////////////////////////
////////////////////////////////
// InodesRootCtrl
////////////////////////////////
////////////////////////////////


// initializer for the inodes root model/controller

function InodesRootCtrl($scope, $safe, $timeout) {
	$scope.root_dir = new Inode($scope, null, '', true, null);

	// dir_inode is needed to bootstrap the recursive rendering templates
	$scope.dir_inode = $scope.root_dir;

	// the dir selection will set a dir_active tag
	$scope.dir_selection = new InodesSelection({
		'dir_active': 'active'
	});
	$scope.dir_selection.select($scope.root_dir);

	// the inode selection will set a inode_active tag
	$scope.inode_selection = new InodesSelection({
		'inode_active': 'active'
	});
	$scope.inode_selection.select($scope.root_dir);

	$scope.select = function(inode, opt) {
		if (!inode) {
			return;
		}
		if (!opt) {
			opt = {};
		}
		$scope.inode_selection.select(inode);
		if (inode.isdir) {
			if (opt.dir) {
				$scope.dir_selection.select(inode);
				inode.read_dir();
				if (opt.open || opt.open_dir) {
					inode.expand_path();
				}
				if (opt.toggle) {
					inode.expand_toggle();
				}
			}
		} else {
			if (opt.open) {
				inode.download_file();
			}
		}
		if (opt.context) {
			open_context_menu(opt.context);
		}
	};

	$scope.read_dir_callback = function(dir_inode) {
		if ($scope.hide_root_dir && $scope.dir_selection.inode && !$scope.dir_selection.inode.id) {
			for (var id in dir_inode.dir_state.subdirs) {
				break;
			}
			$scope.select(dir_inode.dir_state.subdirs[id], {
				dir: true
			});
		}
	};

	$scope.curr_dir_refresh = function() {
		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			return;
		}
		dir_inode.read_dir().on({
			'all': function() {
				if ($scope.do_refresh_selection) {
					$timeout($scope.curr_dir_refresh, 20000);
				}
			},
			'error': function() {
				$scope.curr_dir_refresh_failed = true;
			},
			'success': function() {
				$scope.curr_dir_refresh_failed = false;
			}
		});
	};
	$scope.curr_dir_refresh();

	// this drop handler is a generic implementation of drop over a directory.
	// it will either rename if drag is an inode, or upload if a dataTransfer.
	// child scopes will choose if to use it by connecting the inode_drop to it.
	$scope.inode_drop_handler = function(drop_inode, drag_inode, event) {
		if (!drop_inode || !drop_inode.isdir) {
			return false;
		}
		if (event.type === 'dragover' || event.type === 'dragenter') {
			return true;
		}
		if (event.type === 'drop' && drag_inode) {
			// when drag is an inode, then move it under the drop dir
			console.log('drag ' + drag_inode.name + ' drop ' + drop_inode.name);
			drag_inode.rename(drop_inode, drag_inode.name).on('all', function() {
				// select the drop dir
				$scope.select(drop_inode, {
					dir: true,
					open: true
				});
			});
			return true;
		}
		return false;
	};
}



////////////////////////////////
////////////////////////////////
// InodesTreeCtrl
////////////////////////////////
////////////////////////////////


function InodesTreeCtrl($scope) {
	$scope.inode_click = function(inode) {
		$scope.select(inode, {
			dir: true
		});
	};
	$scope.inode_dclick = function(inode) {
		$scope.select(inode, {
			dir: true,
			toggle: true
		});
	};
	$scope.inode_rclick = function(inode, event) {
		$scope.select(inode, {
			dir: true,
			context: event
		});
	};
	$scope.inode_drag = function(inode, event) {
		console.log(event.type + ' ' + inode.name);
		return inode;
	};
	$scope.inode_drop = $scope.inode_drop_handler;
}



////////////////////////////////
////////////////////////////////
// InodesListCtrl
////////////////////////////////
////////////////////////////////


function InodesListCtrl($scope) {
	$scope.inode_click = function(inode) {
		$scope.select(inode);
	};
	$scope.inode_dclick = function(inode) {
		$scope.select(inode, {
			dir: true,
			open: true
		});
	};
	$scope.inode_rclick = function(inode, event) {
		$scope.select(inode, {
			context: event
		});
	};
	$scope.inode_drag = function(inode, event) {
		console.log(event.type + ' ' + inode.name);
		return inode;
	};
	$scope.inode_drop = $scope.inode_drop_handler;
}



////////////////////////////////
////////////////////////////////
// InodesBreadcrumbCtrl
////////////////////////////////
////////////////////////////////


function InodesBreadcrumbCtrl($scope) {
	$scope.inode_click = function(inode) {
		$scope.select(inode, {
			dir: true,
			open: true
		});
	};
}



////////////////////////////////
////////////////////////////////
// InodesUploadListCtrl
////////////////////////////////
////////////////////////////////

// This controller handles the clicks on the device inodes list to allow navigation.

function InodesDeviceListCtrl($scope) {

	// single click - change selection
	$scope.inode_click = function(inode) {
		$scope.select(inode);
	};

	// double click - select and also dive into dir
	$scope.inode_dclick = function(inode) {
		$scope.select(inode, {
			dir: true,
			open_dir: true
		});
		// our parent scope is the device modal, so we can submit
		// $scope.$parent.submit();
	};

	// right click - like double click for less clicks
	$scope.inode_rclick = function(inode, event) {
		$scope.inode_dclick(inode);
	};
}



////////////////////////////////
////////////////////////////////
// InodesMenuCtrl
////////////////////////////////
////////////////////////////////


function InodesMenuCtrl($scope, $safe) {
	$scope.click_open = function() {
		var inode = $scope.inode_selection.inode;
		$scope.select(inode, {
			dir: true,
			open: true
		});
	};
	$scope.click_refresh = function() {
		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			$scope.alerts.add('no selected dir, bailing');
			return;
		}
		dir_inode.read_dir();
	};
	$scope.click_delete = function() {
		var inode = $scope.inode_selection.inode;
		if (!inode) {
			$scope.alerts.add('no selected dir, bailing');
			return;
		}
		inode.delete_inode().on('all', function() {
			if (inode.id == $scope.inode_selection.inode.id) {
				$scope.select(inode.parent, {
					dir: true,
					open_dir: true
				});
			}
		});
	};
}



////////////////////////////////
////////////////////////////////
// NewFolderModalCtrl
////////////////////////////////
////////////////////////////////


function NewFolderModalCtrl($scope, $safe) {
	// since the callback is not in angular context,
	// we use apply to fire the watches.
	var new_folder_modal = $('#new_folder_modal');
	new_folder_modal.on('show', $safe.$callback($scope, function() {
		// reset text on show
		$scope.new_name = '';
	}));
	new_folder_modal.on('shown', function() {
		// focus and select the text
		$('#new_folder_input')[0].focus();
		$('#new_folder_input')[0].select();
	});

	$scope.submit = function() {
		new_folder_modal.modal('hide');
		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			$scope.alerts.add('no selected inode, bailing');
			return;
		}
		if ($scope.new_name) {
			dir_inode.mkdir($scope.new_name);
		}
	};
}



////////////////////////////////
////////////////////////////////
// RenameModalCtrl
////////////////////////////////
////////////////////////////////


function RenameModalCtrl($scope, $safe) {
	// since the callback is not in angular context,
	// we use apply to fire the watches.
	var rename_modal = $('#rename_modal');
	rename_modal.on('show', $safe.$callback($scope, function() {
		// reset text on show
		$scope.new_name = $scope.inode_selection.inode.name;
	}));
	rename_modal.on('shown', function() {
		// focus and select the text
		$('#rename_input')[0].focus();
		$('#rename_input')[0].select();
	});

	$scope.submit = function() {
		rename_modal.modal('hide');
		var inode = $scope.inode_selection.inode;
		if (!inode) {
			$scope.alerts.add('no selected inode, bailing');
			return;
		}
		if ($scope.new_name !== inode.name) {
			inode.rename(inode.parent, $scope.new_name);
		}
	};
}



////////////////////////////////
////////////////////////////////
// ShareModalCtrl
////////////////////////////////
////////////////////////////////


function ShareModalCtrl($scope, $safe) {
	$scope.share_inode = null;
	$scope.share_list = [];

	// since the callback is not in angular context,
	// we use apply to fire the watches.
	var share_modal = $('#share_modal');
	share_modal.on('show', $safe.$callback($scope, function() {
		$scope.share_inode = $scope.inode_selection.inode;
		$scope.share_inode.get_share_list().on('success', function(data) {
			$scope.share_list = data.list;
		});
	}));
	share_modal.on('hiden', $safe.$callback($scope, function() {
		$scope.share_inode = null;
		$scope.share_list = [];
	}));

	$scope.submit = function() {
		var inode = $scope.share_inode;
		var share_list = $scope.share_list;
		share_modal.modal('hide');
		inode.share(share_list).on('success', function(data) {
			// TODO: better show working sign of the ajax operation and only here hide the modal
		});
	};
}



////////////////////////////////
////////////////////////////////
// UploadCtrl
////////////////////////////////
////////////////////////////////


function UploadCtrl($scope, $safe, $http, $timeout) {

	$scope.timeout = $timeout;

	// set the api url to the planet
	$scope.api_url = planet_api;
	$scope.inode_api_url = planet_api + "inode/";

	// returns an event object with 'success' and 'error' events,
	// which allows multiple events can be registered on the ajax result.
	$scope.http = function(req) {
		console.log('[http]', req);
		var ev = _.clone(Backbone.Events);
		ev.on('success', function(data, status) {
			console.log('[http ok]', [status, req]);
		});
		ev.on('error', function(data, status) {
			$scope.alerts.add(data || 'http request failed', [status, req]);
		});
		var ajax = $http(req);
		ajax.success(function(data, status, headers, config) {
			ev.trigger('success', data, status, headers, config);
		});
		ajax.error(function(data, status, headers, config) {
			ev.trigger('error', data, status, headers, config);
		});
		return ev;
	};

	// calling directly since we just want to include the inodes root scope here
	$scope.do_refresh_selection = false;
	$scope.hide_root_dir = false;
	InodesRootCtrl($scope, $safe, $timeout);

	var upload_modal = $('#upload_modal');
	upload_modal.on('show', $safe.$callback($scope, function() {
		$scope.curr_dir_refresh();
	}));

	$scope.submit = function() {
		upload_modal.modal('hide');
		var dir_inode = $scope.$parent.dir_selection.inode;
		if (!dir_inode) {
			$scope.alerts.add('no selected dir, bailing');
			return;
		}
		var inode = $scope.inode_selection.inode;
		if (!inode) {
			$scope.alerts.add('no selected inode, bailing');
			return;
		}
		inode.dev_upload(dir_inode);
	};

	$scope.upload_id_idx = 0;
	$scope.uploads = {};
	$scope.max_uploads_at_once = 10;

	$scope.add_upload = function(event, data) {
		if (num_running_uploads > $scope.max_uploads_at_once) {
			alert('Don\'t you think that ' + num_running_uploads +
				' is too many files to upload at once?');
			return false;
		}

		var dir_inode = $scope.$parent.dir_selection.inode;
		if (!dir_inode) {
			$scope.alerts.add('no selected dir, bailing');
			return;
		}

		// make sure the modal shows - this is needed when drop/paste
		// and the modal is hidden.
		upload_modal.modal('show');

		// create the upload object and connect to uploads list,
		var file = data.files[0];
		var idx = $scope.upload_id_idx;
		var upload = {
			idx: idx,
			dir_inode: dir_inode,
			data: data,
			file: file,
			progress: 0,
			status: 'Creating...',
			row_class: '',
			progress_class: 'progress progress-success'
		};
		// link the upload object on the data to propagate progress
		data.upload_idx = idx;
		$scope.upload_id_idx++;
		$scope.uploads[idx] = upload;

		// create the file and receive upload location info
		console.log('creating file:', file);
		var ev = dir_inode.mkfile(file.name, file.size, file.type, file.relativePath);
		ev.on('success', function(mkfile_data) {
			upload.status = 'Uploading...';
			// using s3 upload with signed url
			data.type = 'POST';
			data.multipart = true;
			data.url = mkfile_data.s3_post_info.url;
			data.formData = mkfile_data.s3_post_info.form;
			console.log('MKFILE:', mkfile_data);
			console.log('DATA:', data);

			upload.xhr = data.submit();
			upload.xhr.success(function(result, textStatus, jqXHR) {
				console.log('[ok] upload success');
				upload.status = 'Finishing...';
				safe_apply($scope);
				// update the file state to uploading=false
				return $scope.http({
					method: 'PUT',
					url: $scope.$parent.inode_api_url + mkfile_data.id,
					data: {
						uploading: false
					}
				}).on('success', function() {
					upload.status = 'Completed';
					upload.row_class = 'success';
					safe_apply($scope);
				}).on('error', function() {
					upload.status = 'Failed!';
					upload.row_class = 'error';
					upload.progress_class = 'progress progress-danger';
					upload.progress = 100;
					safe_apply($scope);
				});
			});
			upload.xhr.error(function(jqXHR, textStatus, errorThrown) {
				$scope.alerts.add('upload error: ' + textStatus + ' ' + errorThrown, jqXHR.responseText);
				upload.status = 'Failed!';
				upload.row_class = 'error';
				upload.progress_class = 'progress progress-danger';
				upload.progress = 100;
				safe_apply($scope);
			});
			upload.xhr.always(function(e, data) {
				// data.result, data.textStatus, data.jqXHR
				num_running_uploads--;
				dir_inode.read_dir();
				safe_apply($scope);
			});
			num_running_uploads++;
			safe_apply($scope);
		});
		ev.on('error', function() {
			upload.status = 'Failed!';
			upload.row_class = 'error';
			upload.progress_class = 'progress progress-danger';
			upload.progress = 100;
			safe_apply($scope);
		});
		safe_apply($scope);
	};

	$scope.update_progress = function(event, data) {
		var upload = $scope.uploads[data.upload_idx];
		upload.progress = parseInt(data.loaded / data.total * 100, 10);
		safe_apply($scope);
	};

	$scope.dismiss_upload = function(upload) {
		if (upload.xhr) {
			upload.xhr.abort();
		}
		delete $scope.uploads[upload.idx];
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
}



////////////////////////////////
////////////////////////////////
// MyDataCtrl
////////////////////////////////
////////////////////////////////


function MyDataCtrl($scope, $safe, $http, $timeout) {

	$scope.timeout = $timeout;
	$scope.alerts = new Alerts();

	$scope.api_url = "/star_api/";
	$scope.inode_api_url = $scope.api_url + "inode/";
	$scope.inode_share_sufix = "/share_list"

	// returns an event object with 'success' and 'error' events,
	// which allows multiple events can be registered on the ajax result.
	$scope.http = function(req) {
		console.log('[http]', req);
		var ev = _.clone(Backbone.Events);
		ev.on('success', function(data, status) {
			console.log('[http ok]', [status, req]);
		});
		ev.on('error', function(data, status) {
			$scope.alerts.add(data || 'http request failed', [status, req]);
		});
		var ajax = $http(req);
		ajax.success(function(data, status, headers, config) {
			ev.trigger('success', data, status, headers, config);
		});
		ajax.error(function(data, status, headers, config) {
			ev.trigger('error', data, status, headers, config);
		});
		return ev;
	};

	$scope.layout = {
		show_tree: true,
		show_path: true,
		tree_class: function() {
			return $scope.layout.show_tree ?
				"roundbord bglight span4" :
				"roundbord bglight";
		},
		list_class: function() {
			return $scope.layout.show_tree ?
				"roundbord bglight span8" :
				"roundbord bglight";
		},
		tree_style: function() {
			return $scope.layout.show_tree ? {
				"min-height": "300px"
			} : {
				"min-height": "300px"
			};
		},
		list_style: function() {
			return $scope.layout.show_tree ? {
				"min-height": "300px"
			} : {
				"min-height": "300px",
				"margin-left": "0px"
			};
		}
	};

	// calling directly since we just want to include the inodes root scope here
	$scope.do_refresh_selection = true;
	$scope.hide_root_dir = true;
	InodesRootCtrl($scope, $safe, $timeout);
}


// avoid minification effects by injecting the required angularjs dependencies
InodesRootCtrl.$inject = ['$scope', '$safe', '$timeout'];
InodesTreeCtrl.$inject = ['$scope'];
InodesListCtrl.$inject = ['$scope'];
InodesBreadcrumbCtrl.$inject = ['$scope'];
InodesDeviceListCtrl.$inject = ['$scope'];
InodesMenuCtrl.$inject = ['$scope', '$safe'];
NewFolderModalCtrl.$inject = ['$scope', '$safe'];
RenameModalCtrl.$inject = ['$scope', '$safe'];
ShareModalCtrl.$inject = ['$scope', '$safe'];
UploadCtrl.$inject = ['$scope', '$safe', '$http', '$timeout'];
MyDataCtrl.$inject = ['$scope', '$safe', '$http', '$timeout'];