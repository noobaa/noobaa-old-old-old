/* jshint browser:true, jquery:true, devel:true */
/* global _:false */
/* global Backbone:false */

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
	var x = 0;
	var y = 0;
	if (event.pageX || event.pageY) {
		x = event.pageX;
		y = event.pageY;
	} else if (event.clientX || event.clientY) {
		x = event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
		y = event.clientY + document.body.scrollTop + document.documentElement.scrollTop;
	}
	context_menu.css('position', 'absolute');
	context_menu.css('left', x);
	context_menu.css('top', y);
	context_menu_toggle.dropdown('toggle');
}

function sync_property(to, from, key) {
	if (key in from) {
		to[key] = from[key];
	} else {
		delete to[key];
	}
}



////////////////////////////////
////////////////////////////////
// Inode
////////////////////////////////
////////////////////////////////

var SWM = 'Shared With Me';

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
		if (parent && !parent.id) {
			// for root folders set specific icon classes
			this.icon_class = 'd-root-icon';
			this.caption_class = 'd-root-caption';
			// set a marker on the shared with me folder
			// this will also propagate to all sub inodes
			if (name === SWM) {
				this.swm = true;
			}
		}
	}
	// propagate swm from parent
	if (parent && parent.swm) {
		this.swm = true;
	}
}

// return true for "My Data" and "Shared With Me"
// which are user root dirs and shouldn't be modified.
Inode.prototype.is_immutable_root = function() {
	return this.level < 2;
};

Inode.prototype.is_shared_with_me = function() {
	return this.swm;
};

Inode.prototype.is_not_mine = function() {
	return this.not_mine;
};

Inode.prototype.is_dir_non_empty = function(callback) {
	if (!this.isdir) {
		callback(false);
		return;
	}
	var me = this;
	var ev = this.load_dir();
	if (!ev) {
		callback( !! me.dir_state.sons_list.length);
	} else {
		ev.on('all', function() {
			callback( !! me.dir_state.sons_list.length);
		});
	}
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
		return this.read_dir();
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
		sync_property(son, ent, "progress");
		sync_property(son, ent, "not_mine");
		sync_property(son, ent, "owner_name");
		sync_property(son, ent, "owner_fbid");

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

Inode.prototype.handle_drop = function(inode) {
	// propagate to scope to handle
	this.$scope.handle_drop(this, inode);
};

Inode.prototype.get_drag_helper = function() {
	return $('<div class="label label-default roundbord">' +
		'<span class="fntthin fntmd">Moving: <b>' +
		this.name + '</b></span></div>').css('z-index', 1);
};

Inode.prototype.make_inode_with_icon = function() {
	var e = $('#inode_with_icon').clone();
	e.find('#inode_with_icon_name').text(this.name);
	if (this.isdir) {
		e.find('#inode_with_icon_dir').show();
	} else {
		e.find('#inode_with_icon_file').show();
	}
	return e;
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
// MyDataCtrl
////////////////////////////////
////////////////////////////////

MyDataCtrl.$inject = ['$scope', '$http', '$timeout', '$window'];

function MyDataCtrl($scope, $http, $timeout, $window) {

	$scope.timeout = $timeout;
	$scope.api_url = "/star_api/";
	$scope.inode_api_url = $scope.api_url + "inode/";
	$scope.user_usage_url = $scope.api_url + "user/usage";
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

	$scope.handle_drop_over = function(event, ui, drop_inode) {
		$scope.handle_drop_out();
		if (drop_inode.isdir) {
			$scope.drop_over_timeout = $timeout(function() {
				console.log('DROP OVER TIMEOUT', drop_inode);
				$scope.safe_apply(function() {
					drop_inode.expand_path();
					drop_inode.load_dir();
				});
			}, 500);
		}
	};

	$scope.handle_drop_out = function(event, ui, drop_inode) {
		if ($scope.drop_over_timeout) {
			$timeout.cancel($scope.drop_over_timeout);
			delete $scope.drop_over_timeout;
		}
	};

	// this drop handler is a generic implementation of drop over a directory.
	// it will either rename if drag is an inode.
	$scope.handle_drop = function(drop_inode, drag_inode) {
		if (!drop_inode.isdir || !drag_inode) {
			return;
		}
		// when drag is an inode, then move it under the drop dir
		console.log('drag ' + drag_inode.name + ' drop ' + drop_inode.name);
		if (drag_inode.is_immutable_root()) {
			$.nbalert('Cannot move root folder');
			return;
		}
		if (drag_inode.is_shared_with_me() || drop_inode.is_shared_with_me()) {
			$.nbalert('Cannot move files of the "' + SWM + '" folder');
			return;
		}
		if (drag_inode.is_not_mine()) {
			$.nbalert('Cannot move someone else\'s file');
			return;
		}
		if (drop_inode.is_not_mine()) {
			$.nbalert('Cannot move to someone else\'s folder');
			return;
		}
		var p = drop_inode;
		while (p) {
			if (p.id === drag_inode.id) {
				$.nbalert('Cannot create circular folders.<br/>It\'s just wrong...');
				return;
			}
			p = p.parent;
		}
		if (drag_inode.parent.id === drop_inode.id) {
			console.log('dropped into same parent. nothing to do.');
			return;
		}

		var dlg = $('#move_dialog').clone();
		dlg.find('.inode_label').eq(0).html(drag_inode.make_inode_with_icon());
		dlg.find('.inode_label').eq(1).html(drop_inode.make_inode_with_icon());
		dlg.find('#dialog_ok').off('click').on('click', function() {
			dlg.nbdialog('close');
			drag_inode.rename(drop_inode, drag_inode.name).on('all', function() {
				// select the drop dir
				$scope.select(drop_inode, {
					dir: true,
					open: true
				});
			});
		});
		dlg.nbdialog('open', {
			remove_on_close: true,
			modal: true
		});
	};


	// inode sorting //

	function sorter(key_func, up) {
		return function(a, b) {
			if (a.isdir !== b.isdir) {
				return a.isdir ? -1 : 1;
			}
			var aval = key_func(a);
			var bval = key_func(b);
			if (aval < bval) {
				return up;
			}
			if (aval > bval) {
				return -up;
			}
			return 0;
		};
	}

	function sort_key_name_lower(inode) {
		return inode.name.toLowerCase();
	}

	function sort_key_size(inode) {
		return inode.size;
	}

	function sort_key_user(inode) {
		return inode.owner_name ? inode.owner_name.toLowerCase() : '';
	}

	var sort_by_name_up = sorter(sort_key_name_lower, 1);
	var sort_by_name_down = sorter(sort_key_name_lower, -1);
	var sort_by_size_up = sorter(sort_key_size, 1);
	var sort_by_size_down = sorter(sort_key_size, -1);
	var sort_by_user_up = sorter(sort_key_user, 1);
	var sort_by_user_down = sorter(sort_key_user, -1);
	$scope.default_sort_by = sort_by_name_down;

	$scope.toggle_sort_by_name = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_name_down) {
			s.sort_by = sort_by_name_up;
		} else {
			s.sort_by = sort_by_name_down;
		}
		i.resort_entries();
	};
	$scope.toggle_sort_by_size = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_size_down) {
			s.sort_by = sort_by_size_up;
		} else {
			s.sort_by = sort_by_size_down;
		}
		i.resort_entries();
	};
	$scope.toggle_sort_by_user = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_user_down) {
			s.sort_by = sort_by_user_up;
		} else {
			s.sort_by = sort_by_user_down;
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
	$scope.get_sort_by_user_class = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_user_up) {
			return 'icon-caret-up';
		} else if (s.sort_by === sort_by_user_down) {
			return 'icon-caret-down';
		}
	};
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

	$scope.click_mkdir = function() {
		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			console.error('no selected dir, bailing');
			return;
		}
		if (dir_inode.is_shared_with_me()) {
			$.nbalert('Cannot create folder under the "' + SWM + '" folder');
			return;
		}
		if (dir_inode.is_not_mine()) {
			$.nbalert('Cannot create folder in someone else\'s folder');
			return;
		}
		var dlg = $('#mkdir_dialog').clone();
		var input = dlg.find('#dialog_input');
		input.val('');
		dlg.find('.inode_label').html(dir_inode.make_inode_with_icon());
		dlg.find('#dialog_ok').off('click').on('click', function() {
			dlg.nbdialog('close');
			if (input.val()) {
				dir_inode.mkdir(input.val());
			}
		});
		dlg.nbdialog('open', {
			remove_on_close: true,
			modal: true
		});
	};

	$scope.click_rename = function() {
		var inode = $scope.inode_selection.inode;
		if (!inode) {
			console.error('no selected inode, bailing');
			return;
		}
		if (inode.is_immutable_root()) {
			$.nbalert('Cannot rename root folder');
			return;
		}
		if (inode.is_not_mine()) {
			$.nbalert('Cannot rename someone else\'s file');
			return;
		}
		var dlg = $('#rename_dialog').clone();
		var input = dlg.find('#dialog_input');
		input.val(inode.name);
		dlg.find('.inode_label').html(inode.make_inode_with_icon());
		dlg.find('#dialog_ok').off('click').on('click', function() {
			dlg.nbdialog('close');
			if (input.val() && input.val() !== inode.name) {
				inode.rename(inode.parent, input.val());
			}
		});
		dlg.nbdialog('open', {
			remove_on_close: true,
			modal: true
		});
	};

	$scope.click_upload = function() {
		$('#upload_modal').nbdialog('open');
	};

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
			console.error('no selected inode, bailing');
			return;
		}
		if (inode.is_immutable_root()) {
			$.nbalert('Cannot delete root folder');
			return;
		}
		if (inode.is_not_mine()) {
			$.nbalert('Cannot delete someone else\'s file');
			return;
		}
		inode.is_dir_non_empty(function(is_it) {
			if (is_it) {
				$.nbalert('Cannot delete non-empty folder');
				return;
			}
			var dlg = $('#delete_dialog').clone();
			dlg.find('.inode_label').html(inode.make_inode_with_icon());
			dlg.find('#dialog_ok').off('click').on('click', function() {
				dlg.nbdialog('close');
				inode.delete_inode().on('all', function() {
					if (inode.id == $scope.inode_selection.inode.id) {
						$scope.select(inode.parent, {
							dir: true,
							open_dir: true
						});
					}
				});
			});
			dlg.nbdialog('open', {
				remove_on_close: true,
				modal: true
			});
		});
	};
	$scope.click_share = function() {
		var inode = $scope.inode_selection.inode;
		if (!inode) {
			console.error('no selected inode, bailing');
			return;
		}
		if (inode.is_immutable_root()) {
			$.nbalert('Cannot share root folder');
			return;
		}
		if (inode.is_shared_with_me()) {
			$.nbalert('Cannot share files in the "' + SWM + '" folder - use copy...');
			return;
		}
		if (inode.is_not_mine()) {
			$.nbalert('Cannot share someone else\'s file');
			return;
		}
		var dlg = $('#share_modal');
		dlg.find('.inode_label').html(inode.make_inode_with_icon());
		// TODO this is hacky accessing dlg.scope() ...
		dlg.scope().loading_share_list = true;
		dlg.scope().share_inode = inode;
		inode.get_share_list().on('success', function(data) {
			dlg.scope().share_list = data.list;
		}).on('all', function() {
			dlg.scope().loading_share_list = false;
		});
		dlg.nbdialog('open', {
			height: 350,
			width: 350,
			modal: true
		});
	};
}



////////////////////////////////
////////////////////////////////
// ShareModalCtrl
////////////////////////////////
////////////////////////////////

ShareModalCtrl.$inject = ['$scope'];

function ShareModalCtrl($scope) {
	$scope.submit = function() {
		var inode = $scope.share_inode;
		var share_list = $scope.share_list;
		$('#share_modal').nbdialog('close');
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
// UserCtrl
////////////////////////////////
////////////////////////////////

UserCtrl.$inject = ['$scope', '$http', '$timeout'];

function UserCtrl($scope, $http, $timeout) {
	$scope.user_quota = 0;
	$scope.user_usage = 0;

	function cancel_usage_refresh() {
		$timeout.cancel($scope.usage_refresh_timeout);
		delete $scope.usage_refresh_timeout;
	}

	function usage_refresh() {
		cancel_usage_refresh();
		$http({
			method: "GET",
			url: "/star_api/user/usage",
		}).success(function(data, status, headers, config) {
			$scope.user_quota = data.user_quota;
			$scope.user_usage = data.user_usage;
			cancel_usage_refresh();
			$scope.usage_refresh_timeout =
				$timeout(usage_refresh, 30000);
		}).error(function(data, status, headers, config) {
			console.log("Error in querying user usage: ", status);
			cancel_usage_refresh();
			$scope.usage_refresh_timeout =
				$timeout(usage_refresh, 30000);
		});
	}
	usage_refresh();

}



////////////////////////////////
////////////////////////////////
// UploadCtrl
////////////////////////////////
////////////////////////////////

UploadCtrl.$inject = ['$scope'];

function UploadCtrl($scope) {

	var upload_modal = $('#upload_modal');
	upload_modal.nbdialog({
		width: 600
	});

	$scope.upload_id_idx = 0;
	$scope.uploads = {};
	$scope.max_uploads_at_once = 20;

	$scope.has_uploads = function() {
		return !_.isEmpty($scope.uploads);
	};

	$scope.add_upload = function(event, data) {
		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			console.error('no selected dir, bailing');
			return;
		}
		if (dir_inode.is_shared_with_me()) {
			$.nbalert('Cannot upload to a shared folder');
			return;
		}
		if (dir_inode.is_not_mine()) {
			$.nbalert('Cannot upload to someone else\'s folder');
			return;
		}
		if (num_running_uploads > $scope.max_uploads_at_once) {
			$.nbalert('Don\'t you think that ' + num_running_uploads +
				' is too many files to upload at once?');
			return;
		}

		// make sure the modal shows - this is needed when drop/paste
		// and the modal is hidden.
		upload_modal.nbdialog('open');

		// create the upload object and connect to uploads list,
		var file = data.files[0];
		var idx = $scope.upload_id_idx;
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
		$scope.upload_id_idx++;
		$scope.uploads[idx] = upload;
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
}