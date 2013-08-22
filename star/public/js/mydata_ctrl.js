/* jshint browser:true, jquery:true, devel:true */
/* global _:false */
/* global Backbone:false */
/* global planet_api:false */

// TODO: how do we fix this warning? - "Use the function form of "use strict". (W097)"
/* jshint -W097 */
'use strict';


var num_running_uploads = 0;

// init jquery stuff
$(function() {
	window.onbeforeunload = function() {
		if (num_running_uploads) {
			return "Leaving this page will interrupt your running Uploads !!!";
		}
	};
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
	if (!from[key]) {
		to[key] = "";
		return;
	}
	if (to[key] === from[key]) {
		return;
	}
	if (from[key]) {
		to[key] = from[key];
		return;
	}
}



////////////////////////////////
////////////////////////////////
// Inode
////////////////////////////////
////////////////////////////////


// Inode model for dir/file

function Inode($scope, id, name, isdir, parent) {

	// link to the scope that serves the inode - 
	// it is used mainly for access to api functions to act on the inode in the server
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
			sons_map: {}, // by id
			sons_list: [],
			subdirs_list: [],
			populated: false,
			expanded: false
		};
	}
}

// return true for "My Data" and "Shared With Me"
// which are user root dirs and shouldn't be modified.
Inode.prototype.is_immutable_root = function() {
	return this.level < 2;
};

Inode.prototype.is_dir_non_empty = function() {
	return (this.isdir && this.dir_state.sons_list.length);
};

// construct a list of the path of dirs from the root down to this inode.
Inode.prototype.get_path = function() {
	var path = [];
	var i = this;
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
	var sons_map = {};
	var sons_list = [];
	var subdirs_list = [];

	for (var i = 0; i < entries.length; ++i) {
		var ent = entries[i];
		var son = this.dir_state.sons_map[ent.id];
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
		}

		// sync fields which are mutable
		sync_property(son, this, "$scope");
		sync_property(son, ent, "name");
		sync_property(son, ent, "isdir");
		sync_property(son, ent, "size");
		sync_property(son, ent, "uploading");
		sync_property(son, ent, "shared_name");
		sync_property(son, ent, "shared_fb_id");
		sync_property(son, ent, "progress");

		sons_map[son.id] = son;
		sons_list.push(son);
		if (son.isdir) {
			subdirs_list.push(son);
		}
	}

	this.dir_state.sons_map = sons_map;
	this.dir_state.sons_list = sons_list;
	this.dir_state.subdirs_list = subdirs_list;
	this.dir_state.populated = true;
	this.resort_entries();
	this.$scope.read_dir_callback(this);
};

Inode.prototype.resort_entries = function() {
	var sort_by = this.dir_state.sort_by || this.$scope.default_sort_by;
	this.dir_state.sons_list.sort(sort_by);
	this.dir_state.subdirs_list.sort(sort_by);
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

Inode.prototype.handle_drop = function(inode) {
	// propagate to scope to handle
	this.$scope.handle_drop(this, inode);
};

Inode.prototype.handle_drop_over = function() {
	if (this.isdir) {
		this.expand_path();
		this.load_dir();
	}
};

Inode.prototype.get_drag_helper = function() {
	return $('<div class="label label-important"><b class="lead">' +
		this.name + '</b></div>');
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
};

Inode.prototype.get_share_list = function() {
	console.log("In get share list!!!!");
	console.log(this);
	return this.$scope.http({
		method: 'GET',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_share_sufix
	});
};

Inode.prototype.share = function(share_list) {
	console.log("Going to share with :", share_list, "for inode:");
	console.log(this);
	return this.$scope.http({
		method: 'PUT',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_share_sufix,
		data: {
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
// setup_inodes_root_ctrl
////////////////////////////////
////////////////////////////////


// initializer for the inodes root model/controller

function setup_inodes_root_ctrl($scope, $timeout, $window) {
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

	// when no selection, select the first thing we can.
	$scope.read_dir_callback = function(dir_inode) {
		if ($scope.dir_selection.inode && !$scope.dir_selection.inode.id) {
			var any_subdir = dir_inode.dir_state.subdirs_list.length ?
				dir_inode.dir_state.subdirs_list[0] : undefined;
			$scope.select(any_subdir, {
				dir: true
			});
		}
	};

	function cancel_curr_dir_refresh() {
		$timeout.cancel($scope.curr_dir_refresh_timeout);
		delete $scope.curr_dir_refresh_timeout;
	}

	function curr_dir_refresh() {
		cancel_curr_dir_refresh();
		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			return;
		}
		dir_inode.read_dir().on({
			'all': function() {
				cancel_curr_dir_refresh();
				$scope.curr_dir_refresh_timeout =
					$timeout(curr_dir_refresh, 30000);
			}
		});
	}
	curr_dir_refresh();

	// this drop handler is a generic implementation of drop over a directory.
	// it will either rename if drag is an inode.
	$scope.handle_drop = function(drop_inode, drag_inode) {
		if (!drop_inode.isdir || !drag_inode) {
			return;
		}
		// when drag is an inode, then move it under the drop dir
		console.log('drag ' + drag_inode.name + ' drop ' + drop_inode.name);
		if (drag_inode.is_immutable_root()) {
			window.alert('Cannot move root folder.');
			return;
		}
		var p = drop_inode;
		while (p) {
			if (p.id === drag_inode.id) {
				window.alert('Cannot create circular folders. It\'s just wrong.');
				return;
			}
			p = p.parent;
		}
		if (drag_inode.parent.id === drop_inode.id) {
			console.log('dropped into same parent. nothing to do.');
			return;
		}
		var q = 'Really move "' + drag_inode.name + '"" into "' + drop_inode.name + '" ?';
		if ($window.confirm(q)) {
			drag_inode.rename(drop_inode, drag_inode.name).on('all', function() {
				// select the drop dir
				$scope.select(drop_inode, {
					dir: true,
					open: true
				});
			});
		}
	};

	$scope.default_sort_by = sort_by_name_down;

	$scope.toggle_sort_by_name = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_name_up) {
			s.sort_by = sort_by_name_down;
		} else {
			s.sort_by = sort_by_name_up;
		}
		i.resort_entries();
	};
	$scope.toggle_sort_by_size = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_size_up) {
			s.sort_by = sort_by_size_down;
		} else {
			s.sort_by = sort_by_size_up;
		}
		i.resort_entries();
	};
	$scope.get_sort_by_name_class = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_name_up) {
			return 'icon-caret-up';
		} else if (!s.sort_by || s.sort_by === sort_by_name_down) {
			return 'icon-caret-down';
		}
	};
	$scope.get_sort_by_size_class = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_size_up) {
			return 'icon-caret-up';
		} else if (s.sort_by === sort_by_size_down) {
			return 'icon-caret-down';
		}
	};

	// TODO write this sorting logic shorted...
	// TODO add sort by user

	function sort_by_name_down(a, b) {
		if (a.isdir !== b.isdir) {
			return a.isdir ? -1 : 1;
		}
		if (a.name.toLowerCase() > b.name.toLowerCase()) {
			return 1;
		}
		if (a.name.toLowerCase() < b.name.toLowerCase()) {
			return -1;
		}
		return 0;
	}

	function sort_by_name_up(a, b) {
		if (a.isdir !== b.isdir) {
			return a.isdir ? -1 : 1;
		}
		if (a.name.toLowerCase() < b.name.toLowerCase()) {
			return 1;
		}
		if (a.name.toLowerCase() > b.name.toLowerCase()) {
			return -1;
		}
		return 0;
	}

	function sort_by_size_down(a, b) {
		if (a.isdir !== b.isdir) {
			return a.isdir ? -1 : 1;
		}
		if (a.size > b.size) {
			return 1;
		}
		if (a.size < b.size) {
			return -1;
		}
		return 0;
	}

	function sort_by_size_up(a, b) {
		if (a.isdir !== b.isdir) {
			return a.isdir ? -1 : 1;
		}
		if (a.size < b.size) {
			return 1;
		}
		if (a.size > b.size) {
			return -1;
		}
		return 0;
	}
}



////////////////////////////////
////////////////////////////////
// InodesTreeCtrl
////////////////////////////////
////////////////////////////////

InodesTreeCtrl.$inject = ['$scope'];

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

InodesListCtrl.$inject = ['$scope'];

function InodesListCtrl($scope) {

	$scope.fb_pic_url = function(fbid) {
		return (!fbid || fbid == ' ') ? '' :
			'https://graph.facebook.com/' + fbid + '/picture';
	};

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
	$scope.inode_drop = function(dir_inode) {
		return {
			fn: $scope.inode_drop_handler,
			hover: 'drophover'
		};
	};
	$scope.inode_drag = function(inode, event) {
		console.log(event.type + ' ' + inode.name);
		return inode;
	};
}



////////////////////////////////
////////////////////////////////
// InodesBreadcrumbCtrl
////////////////////////////////
////////////////////////////////

InodesBreadcrumbCtrl.$inject = ['$scope'];

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
// InodesMenuCtrl
////////////////////////////////
////////////////////////////////

InodesMenuCtrl.$inject = ['$scope'];

function InodesMenuCtrl($scope) {
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
			console.error('no selected dir, bailing');
			return;
		}
		dir_inode.read_dir();
	};
	$scope.click_delete = function() {
		var inode = $scope.inode_selection.inode;
		if (!inode) {
			console.error('no selected dir, bailing');
			return;
		}
		if (inode.is_immutable_root()) {
			window.alert('Cannot delete root folder.');
			return;
		}
		if (inode.is_dir_non_empty()) {
			window.alert('Cannot delete non-empty folder.');
			return;
		}
		var q = 'Really delete this item?\n' + inode.name;
		if (!window.confirm(q)) {
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

NewFolderModalCtrl.$inject = ['$scope'];

function NewFolderModalCtrl($scope) {
	// since the callback is not in angular context,
	// we use apply to fire the watches.
	var new_folder_modal = $('#new_folder_modal');
	new_folder_modal.on('show', $scope.safe_callback(function() {
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
			console.error('no selected inode, bailing');
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

RenameModalCtrl.$inject = ['$scope'];

function RenameModalCtrl($scope) {
	// since the callback is not in angular context,
	// we use apply to fire the watches.
	var rename_modal = $('#rename_modal');
	rename_modal.on('show', $scope.safe_callback(function() {
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
			console.error('no selected inode, bailing');
			return;
		}
		if (inode.is_immutable_root()) {
			window.alert('Cannot rename root folder');
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

ShareModalCtrl.$inject = ['$scope'];

function ShareModalCtrl($scope) {
	$scope.share_inode = null;
	$scope.share_list = [];

	// since the callback is not in angular context,
	// we use apply to fire the watches.
	var share_modal = $('#share_modal');
	share_modal.on('show', $scope.safe_callback(function() {
		$scope.share_inode = $scope.inode_selection.inode;
		$scope.share_inode.get_share_list().on('success', function(data) {
			$scope.share_list = data.list;
		});
	}));
	share_modal.on('hiden', $scope.safe_callback(function() {
		$scope.share_inode = null;
		$scope.share_list = [];
	}));

	$scope.submit = function() {
		var inode = $scope.share_inode;
		var share_list = $scope.share_list;
		share_modal.modal('hide');
		console.log('------------------------------');
		console.log("inode", inode);
		console.log("share_list", share_list);
		console.log('------------------------------');
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

UploadCtrl.$inject = ['$scope'];

function UploadCtrl($scope) {

	var upload_modal = $('#upload_modal');

	$scope.upload_id_idx = 0;
	$scope.uploads = {};
	$scope.max_uploads_at_once = 10;

	$scope.add_upload = function(event, data) {
		if (num_running_uploads > $scope.max_uploads_at_once) {
			alert('Don\'t you think that ' + num_running_uploads +
				' is too many files to upload at once?');
			return false;
		}

		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			console.error('no selected dir, bailing');
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
			progress_class: 'progress progress-success',
		};
		// link the upload object on the data to propagate progress
		data.upload_idx = idx;
		$scope.upload_id_idx++;
		$scope.uploads[idx] = upload;

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
			console.log('MKFILE:', mkfile_data);
			console.log('DATA:', data);

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
				}).on('success', function() {
					upload.status = 'Completed';
					upload.row_class = 'success';
					$scope.safe_apply();
				}).on('error', function() {
					upload.status = 'Failed!';
					upload.row_class = 'error';
					upload.progress_class = 'progress progress-danger';
					upload.progress = 100;
					$scope.safe_apply();
				});
			});
			upload.xhr.error(function(jqXHR, textStatus, errorThrown) {
				console.error('upload error: ' + textStatus + ' ' + errorThrown, jqXHR.responseText);
				upload.status = 'Failed!';
				upload.row_class = 'error';
				upload.progress_class = 'progress progress-danger';
				upload.progress = 100;
				$scope.safe_apply();
			});
			upload.xhr.always(function(e, data) {
				// data.result, data.textStatus, data.jqXHR
				num_running_uploads--;
				dir_inode.read_dir();
				$scope.safe_apply();
			});
			num_running_uploads++;
			$scope.safe_apply();
		});
		ev.on('error', function(data) {
			console.log('Failed in creation: ', data);

			upload.status = 'Failed!';
			if (data.text) {
				upload.status += " " + data.text;
			}
			if (data.rejection.reason) {
				upload.status += " " + data.rejection.reason;
			}
			upload.row_class = 'error';
			upload.progress_class = 'progress progress-danger';
			upload.progress = 100;
			$scope.safe_apply();
		});
		$scope.safe_apply();
	};

	$scope.update_progress = function(event, data) {
		var upload = $scope.uploads[data.upload_idx];
		upload.progress = parseInt(data.loaded / data.total * 100, 10);

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
		$scope.safe_apply();
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

MyDataCtrl.$inject = ['$scope', '$http', '$timeout', '$window'];

function MyDataCtrl($scope, $http, $timeout, $window) {

	$scope.timeout = $timeout;
	$scope.api_url = "/star_api/";
	$scope.inode_api_url = $scope.api_url + "inode/";
	$scope.inode_share_sufix = "/share_list";

	// returns an event object with 'success' and 'error' events,
	// which allows multiple events can be registered on the ajax result.
	$scope.http = function(req) {
		console.log('[http]', req);
		var ev = _.clone(Backbone.Events);
		ev.on('success', function(data, status) {
			console.log('[http ok]', [status, req]);
		});
		ev.on('error', function(data, status) {
			console.error(data || 'http request failed', [status, req]);
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
	setup_inodes_root_ctrl($scope, $timeout, $window);
}