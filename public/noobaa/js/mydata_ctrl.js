// init jquery stuff

var upload_files_input;
var upload_dir_input;
var num_running_uploads = 0;

$(function() {
	window.onbeforeunload = function () {
		if (num_running_uploads) {
			return "Leaving this page will interrupt your running Uploads !!!";
		}
	};

	upload_files_input = $('#upload_files_input');
	upload_dir_input = $('#upload_dir_input');

	// enable bootstrap tooltips.
	// the container=body is needed due to https://github.com/twitter/bootstrap/issues/5687
	$("[rel=tooltip]").tooltip({ container: 'body' });

	// enable dragging of class draggable
	$(".draggable").draggable({ helper: "clone" });

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
	context_menu.css('position','fixed');
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
	console.log("[ERR]", text, info);
	this.alerts.unshift({text: text, time: new Date(), unread: true});
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
	this.level = parent ? (parent.level+1) : 0;

	// directory state
	if (isdir) {
		this.dir_state = {
			subdirs: {},
			subfiles: {},
			populated: false,
			expanded: false,
			refreshing: false
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
// readdir will read the dir regardless if it was already populated - in such case it will refresh.
// however it will avoid if another readdir is already working (refreshing).
Inode.prototype.read_dir = function(opt) {
	if (this.dir_state.refreshing) {
		return;
	}
	this.dir_state.refreshing = true;
	var me = this; // needed for callbacks propagation
	var req = 'readdir';
	var args = {id: this.id};
	var ajax = this.$scope.api_ajax_get(req, args);
	ajax.error(function(data, status, headers, config) {
		me.dir_state.refreshing = false;
		me.$scope.alerts.add(data || 'readdir failed', [status, req, me]);
		if (opt && opt.error) {
			opt.error(me);
		}
	});
	ajax.success(function(data, status, headers, config) {
		console.log('[ok]', [status, req, me]);
		me.populate_dir(data.entries);
		if (opt && opt.success) {
			opt.success(me);
		}
	});
};

// insert given entries as sub items under the this directory item
Inode.prototype.populate_dir = function(entries) {
	var subdirs = {};
	var subfiles = {};
	var during_upload = false;
	var ent;
	var son;

	for (var i=0; i<entries.length; ++i) {
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
	this.dir_state.refreshing = false;
	this.dir_state.during_upload = during_upload;
	this.$scope.read_dir_callback(this);
};

// helper method to send post request to server api, 
// and when the response arrives refresh the given dirs
Inode.prototype.do_post = function(req, args, read_dir1, read_dir2, data_callback) {
	console.log("[post]", req, args);
	var me = this;
	var ajax = this.$scope.api_ajax_post(req, args);
	ajax.error(function(data, status, headers, config) {
		me.$scope.alerts.add(data || ('request failed: ' + req), [status, req, args, me]);
		if (read_dir1) {
			read_dir1.read_dir();
		}
		if (read_dir2) {
			read_dir2.read_dir();
		}
	});
	ajax.success(function(data, status, headers, config) {
		console.log('[ok]', [status, req, args, me]);
		if (data_callback) {
			data_callback(data);
		}
		if (read_dir1) {
			read_dir1.read_dir();
		}
		if (read_dir2) {
			read_dir2.read_dir();
		}
	});
	console.log("[post submitted]", req, args);
};

// create new dir under this dir
Inode.prototype.mkdir = function(name) {
	var args = {
		id: this.id,
		name: name,
		isdir: true
	};
	this.do_post('mknode', args, this);
};

// delete this inode
Inode.prototype.delete_inode = function() {
	var dir_inode = this.parent;
	if (!dir_inode) {
		me.$scope.alerts.add("You shouldn't delete root dir");
		return;
	}
	var args = {
		id: this.id,
		dir_id: dir_inode.id,
		name: this.name
	};
	this.do_post('delete', args, dir_inode);
};

// rename this inode to the given target dir,name
Inode.prototype.rename = function(to_parent, to_name) {
	var dir_inode = this.parent;
	if (!dir_inode) {
		me.$scope.alerts.add("You shouldn't delete root dir");
		return;
	}
	var args = {
		id: this.id,
		from_dir: dir_inode.id,
		from_name: this.name,
		to_dir: to_parent.id,
		to_name: to_name
	};
	this.do_post('rename', args, to_parent, dir_inode);
};

// send device upload request
Inode.prototype.dev_upload = function(dir_inode) {
	var args = {
		id: this.id,
		dir_id: dir_inode.id
	};
	this.do_post('upload', args, dir_inode);
};

// open a download window on this file
Inode.prototype.download_file = function() {
	if (this.uploading) {
		return;
	}
	var url = this.$scope.api_make_request('download', {id: this.id});
	var win = window.open(url, '_blank');
	win.focus();
};

// web upload of file_data which is given by the jquery fileupload plugin.
// since multiple files or entire directory is supported, we go over each file
// and upload each one - since each one is done by ajax, this is in fact parallel.
Inode.prototype.upload_files = function(event, file_data) {
	var me = this;
	$.each(file_data.files, function (index, file) {
		me.upload_file(file_data, file.name, file.size);
	});
};

// web upload of file_data which is given by the jquery fileupload plugin.
Inode.prototype.upload_file = function(file_data, filename, filesize) {
	var me = this;
	// first create an inode in the server
	var args = {
		id: this.id,
		name: filename,
		isdir: false,
		size: filesize,
		uploading: true
	};
	this.do_post('mknode', args, this, null, function(mknode_data){
		// mknode succeeded, now send the upload data request
		console.log('mknode reply:', mknode_data);
		me.read_dir();
		var upload_args = {id: mknode_data.id};
		file_data.method = 'PUT';
		file_data.url = me.$scope.api_url + 'upload';
		file_data.formData = upload_args;
		num_running_uploads++;

		// use the submit function of the plugin to send ajax with multipart data
		var xhr = file_data.submit();
		xhr.error(function (jqXHR, textStatus, errorThrown) {
			me.$scope.alerts.add('upload error: ' + textStatus + ' ' + errorThrown);
		});
		xhr.success(function (result, textStatus, jqXHR) {
			console.log('[ok] upload success');
		});
		xhr.complete(function (result, textStatus, jqXHR) {
			console.log('[ok] upload complete');
		});
		xhr.always(function (e, data) {
			// data.result, data.textStatus, data.jqXHR
			num_running_uploads--;
			me.read_dir();
		});
	});
};

Inode.prototype.get_share_list = function(data_callback) {
	var args = {
		id: this.id
	};
	this.do_post('get_share_list', args, null, null, data_callback);
};

Inode.prototype.share = function(share_list) {
	var args = {
		id: this.id,
		share_list: share_list
	};
	this.do_post('share', args);
	this.do_post('get_share_list', args, null, null, data_callback);
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
	$scope.dir_selection = new InodesSelection({'dir_active':'active'});
	$scope.dir_selection.select($scope.root_dir);

	// the inode selection will set a inode_active tag
	$scope.inode_selection = new InodesSelection({'inode_active':'active'});
	$scope.inode_selection.select($scope.root_dir);

	$scope.select = function (inode, opt) {
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

	$scope.read_dir_callback = function (dir_inode) {
		if ($scope.hide_root_dir && $scope.dir_selection.inode && !$scope.dir_selection.inode.id) {
			for (var id in dir_inode.dir_state.subdirs) {
				break;
			}
			$scope.select(dir_inode.dir_state.subdirs[id], {dir: true});
		}
	};

	$scope.curr_dir_refresh = function () {
		var dir_inode = $scope.dir_selection.inode;
		if (dir_inode) {
			dir_inode.read_dir({
				success: function () {
					delete $scope.curr_dir_refresh_failed;
					if ($scope.do_refresh_selection) {
						$timeout($scope.curr_dir_refresh, 5000);
					}
				},
				error: function () {
					$scope.curr_dir_refresh_failed = true;
					if ($scope.do_refresh_selection) {
						$timeout($scope.curr_dir_refresh, 5000);
					}
				}
			});
		}
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
		if (event.type === 'drop') {
			// select the drop dir
			$scope.select(drop_inode, {dir: true, open: true});

			if (drag_inode) {
				// when drag is an inode, then move it under the drop dir
				console.log('drag ' + drag_inode.name + ' drop ' + drop_inode.name);
				drag_inode.rename(drop_inode, drag_inode.name);
			} else {
				// when drag is something else, upload it as a file
				console.dir(event.dataTransfer.files);
				console.log('drag ' + event.dataTransfer.files + ' drop ' + drop_inode.name);
				// setup the uploader and send it the files
				upload_files_input.fileupload({
					dataType: 'json',
					add: $safe.$callback($scope, function (event, file_data) {
						drop_inode.upload_files(event, file_data);
					})
				});
				upload_files_input.fileupload('send', {files: event.dataTransfer.files});
			}
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
		$scope.select(inode, {dir: true});
	};
	$scope.inode_dclick = function(inode) {
		$scope.select(inode, {dir: true, toggle: true});
	};
	$scope.inode_rclick = function(inode, event) {
		$scope.select(inode, {dir: true, context: event});
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
		$scope.select(inode, {dir: true, open: true});
	};
	$scope.inode_rclick = function(inode, event) {
		$scope.select(inode, {context: event});
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
		$scope.select(inode, {dir: true, open: true});
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
		$scope.select(inode, {dir: true, open_dir: true});
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
	$scope.click_open = function () {
		var inode = $scope.inode_selection.inode;
		$scope.select(inode, {dir: true, open: true});
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
		inode.delete_inode();
		$scope.select(inode.parent, {dir: true, open_dir: true});
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
		$scope.share_inode.get_share_list(function (data){
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
		inode.share(share_list);
	};
}



////////////////////////////////
////////////////////////////////
// UploadCtrl
////////////////////////////////
////////////////////////////////


function UploadCtrl($scope, $safe, $http, $timeout) {
	// set the api url to the planet
	$scope.api_url = planet_api;
	$scope.api_make_request = function(path, args) {
		return $scope.api_url + path + "?" + $.param(args);
	};
	$scope.api_ajax_get = function(path, args) {
		return $http.get($scope.api_make_request(path, args));
	};
	$scope.api_ajax_post = function(path, args) {
		return $http.post($scope.api_url + path, args);
	};
	$scope.timeout = $timeout;

	// calling directly since we just want to include the inodes root scope here
	$scope.do_refresh_selection = false;
	$scope.hide_root_dir = false;
	InodesRootCtrl($scope, $safe, $timeout);

	var upload_modal = $('#upload_modal');
	upload_modal.on('show', $safe.$callback($scope, function() {
		$scope.curr_dir_refresh();
		if ($('#progressall .bar').css('width') === "100%") {
			$('#progressall .bar').css('width', '0%');
		}
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

	$scope.click_upload_files = function() {
		var dir_inode = $scope.$parent.dir_selection.inode;
		if (!dir_inode) {
			$scope.alerts.add('no selected dir, bailing');
			return;
		}
		// setup the fileupload plugin and open the dialog
		upload_files_input.fileupload({
			dataType: 'json',
			add: $safe.$callback($scope, function (event, file_data) {
				dir_inode.upload_files(event, file_data);
			}),
			progressall: $safe.$callback($scope, function (e, data) {
				var progress = parseInt(data.loaded / data.total * 100, 10);
				$('#progressall .bar').css('width', progress + '%');
			})
		});
		upload_files_input.click();
	};
	$scope.click_upload_dir = function() {
		var dir_inode = $scope.$parent.dir_selection.inode;
		if (!dir_inode) {
			$scope.alerts.add('no selected dir, bailing');
			return;
		}
		// setup the fileupload plugin and open the dialog
		upload_dir_input.fileupload({
			dataType: 'json',
			add: $safe.$callback($scope, function (event, file_data) {
				dir_inode.upload_files(event, file_data);
			}),
			progressall: $safe.$callback($scope, function (e, data) {
				var progress = parseInt(data.loaded / data.total * 100, 10);
				$('#progressall .bar').css('width', progress + '%');
			})
		});
		upload_dir_input.click();
	};
}



////////////////////////////////
////////////////////////////////
// MyDataCtrl
////////////////////////////////
////////////////////////////////


function MyDataCtrl($scope, $safe, $http, $timeout) {

	$scope.api_url = "/star_api/";
	$scope.api_make_request = function(path, args) {
		return $scope.api_url + path + "?" + $.param(args);
	};
	$scope.api_ajax_get = function(path, args) {
		return $http.get($scope.api_make_request(path, args));
	};
	$scope.api_ajax_post = function(path, args) {
		return $http.post($scope.api_url + path, args);
	};
	$scope.timeout = $timeout;

	$scope.alerts = new Alerts();

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
			return $scope.layout.show_tree ?
				{"min-height": "300px"} :
				{"min-height": "300px"};
		},
		list_style: function() {
			return $scope.layout.show_tree ?
				{"min-height": "300px"} :
				{"min-height": "300px", "margin-left": "0px"};
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
