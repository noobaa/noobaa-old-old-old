/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
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

function Inode($scope, id, name, isdir, ctime, parent) {

	// link to the scope that serves the inode - 
	// it is used mainly for access to api functions to act on the inode in the server
	this.$scope = $scope;

	// basic properties
	this.id = id;
	this.name = name;
	this.isdir = isdir;
	this.parent = parent;
	this.ctime = new Date(ctime);

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
		path.unshift(i);
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
				ent.ctime,
				this);

		}

		// sync fields which are mutable
		sync_property(son, this, "$scope");
		sync_property(son, ent, "name");
		sync_property(son, ent, "isdir");
		sync_property(son, ent, "size");
		sync_property(son, ent, "uploading");
		sync_property(son, ent, "num_refs");
		sync_property(son, ent, "not_mine");
		sync_property(son, ent, "owner_name");

		//get only the first name for display. Cleaner and friendlier.
		if (son.owner_name) {
			son.owner_name = son.owner_name.split(' ')[0];
		}
		sync_property(son, ent, "owner_fbid");
		sync_property(son, ent, "ctime");
		if (son.ctime) {
			son.ctime_display = new Date(son.ctime).toLocaleDateString();
		} else {
			son.ctime_display = null;
		}

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
	this.dir_state.subdirs_list.sort(this.$scope.default_sort_by);
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

Inode.prototype.get_share_list = function() {
	console.log('get_share_list', this);
	return this.$scope.http({
		method: 'GET',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_share_sufix
	});
};

Inode.prototype.share = function(share_list) {
	console.log('share', this, 'with', share_list);
	return this.$scope.http({
		method: 'PUT',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_share_sufix,
		data: {
			share_list: share_list
		}
	});
};

Inode.prototype.mklink = function(link_options) {
	console.log('mklink', this, link_options);
	return this.$scope.http({
		method: 'POST',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_link_sufix,
		data: {
			link_options: link_options
		}
	});
};

Inode.prototype.rmlinks = function() {
	console.log('revoke_links', this);
	return this.$scope.http({
		method: 'DELETE',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_link_sufix
	});
};

Inode.prototype.handle_drop = function(inode) {
	// propagate to scope to handle
	this.$scope.handle_drop(this, inode);
};

Inode.prototype.get_drag_helper = function() {
	return $('<div class="label label-default roundbord">' +
		'<span class="fntthin fntmd">Moving: <b>' +
		this.name + '</b></span></div>').css('z-index', 3000);
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
	$scope.inode_share_sufix = "/share_list";
	$scope.inode_link_sufix = "/link";

	// TODO: remove this http() and use $http().then().then() chaining instead
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
					$timeout(curr_dir_refresh, 60000);
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
		if (!drop_inode.isdir || !drag_inode || !drag_inode.id || !drop_inode.id) {
			return;
		}
		// when drag is an inode, then move it under the drop dir
		console.log('drag ' + drag_inode.name + ' drop ' + drop_inode.name);
		if (drag_inode.is_immutable_root()) {
			$.nbalert('Cannot move root folder');
			return;
		}
		if (drag_inode.is_shared_with_me() !== drop_inode.is_shared_with_me()) {
			$.nbalert('Cannot move in or out of the "' + SWM + '" folder.<br/>' +
				'Maybe you meant to use "Copy To My Data"...');
			return;
		}
		if (drag_inode.is_not_mine()) {
			$.nbalert('Cannot move someone else\'s file');
			return;
		}
		if (drop_inode.is_not_mine() || drop_inode.owner_name) {
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
		drag_inode.rename(drop_inode, drag_inode.name);
		/*
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
*/
	};

	$scope.click_mkdir = function() {
		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			console.error('no selected dir, bailing');
			return;
		}

		//check dir creation conditions
		//the first condition is true when looking at a directory which is not owned by the user 
		//the second  is true for ghosts or when not owned by the user
		if (dir_inode.is_not_mine() || dir_inode.owner_name) {
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

	$http({
		method: 'GET',
		url: '/star_api/device/current/'
	}).then(function(res) {
		console.log('LOCAL PLANET', res.data);
		$scope.local_planet = res.data ? res.data.device : null;
	});

	$scope.click_upload = function() {
		if (!$scope.local_planet || !$scope.local_planet.srv_port) {
			$('#upload_modal').nbdialog('open');
			return;
		}
		$http({
			method: 'GET',
			url: 'http://127.0.0.1:' + $scope.local_planet.srv_port
		}).then(function(res) {
			// ok planet will take over
			if (res.data.trim() !== 'NBOK') {
				console.log('UNEXPECTED RESPONSE', res.data);
				$('#upload_modal').nbdialog('open');
			}
		}, function() {
			$('#upload_modal').nbdialog('open');
		});
	};

	$scope.click_coshare = function() {
		$scope.nbguides.cosharing.run();
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

	$scope.click_share = function(inode_arg) {
		if (inode_arg) {
			$scope.select(inode_arg);
		}
		var inode = inode_arg || $scope.inode_selection.inode;
		if (!inode) {
			console.error('no selected inode, bailing');
			return;
		}
		if (inode.is_immutable_root()) {
			$.nbalert('Cannot share root folder');
			return;
		}
		if (inode.is_shared_with_me()) {
			$.nbalert('Cannot share files in the "' + SWM + '" folder.<br/>' +
				'Maybe you meant to use "Copy To My Data"...');
			return;
		}
		if (inode.is_not_mine()) {
			$.nbalert('Cannot share someone else\'s file');
			return;
		}
		$('#share_modal').scope().open(inode);
	};

	// inode sorting //

	function sorter(key_func, up, tie_sorter) {
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
			if (tie_sorter) {
				return tie_sorter(a, b);
			} else {
				return 0;
			}
		};
	}

	function sort_key_name_lower(inode) {
		return inode.name.toLowerCase();
	}

	function sort_key_size(inode) {
		return inode.size;
	}

	function sort_key_ctime(inode) {
		return inode.ctime;
	}

	function sort_key_shared(inode) {
		if (inode.swm) {
			return inode.owner_name ? inode.owner_name.toLowerCase() : '';
		} else {
			return inode.num_refs ? inode.num_refs : 0;
		}
	}

	var sort_by_name_up = sorter(sort_key_name_lower, 1);
	var sort_by_name_down = sorter(sort_key_name_lower, -1);
	var sort_by_size_up = sorter(sort_key_size, 1);
	var sort_by_size_down = sorter(sort_key_size, -1);
	var sort_by_shared_up = sorter(sort_key_shared, 1, sort_by_name_down);
	var sort_by_shared_down = sorter(sort_key_shared, -1, sort_by_name_down);
	var sort_by_ctime_up = sorter(sort_key_ctime, 1);
	var sort_by_ctime_down = sorter(sort_key_ctime, -1);
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
	$scope.toggle_sort_by_shared = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_shared_down) {
			s.sort_by = sort_by_shared_up;
		} else {
			s.sort_by = sort_by_shared_down;
		}
		i.resort_entries();
	};
	$scope.toggle_sort_by_ctime = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_ctime_down) {
			s.sort_by = sort_by_ctime_up;
		} else {
			s.sort_by = sort_by_ctime_down;
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
	$scope.get_sort_by_shared_class = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_shared_up) {
			return 'icon-caret-up';
		} else if (s.sort_by === sort_by_shared_down) {
			return 'icon-caret-down';
		}
	};
	$scope.get_sort_by_ctime_class = function() {
		var i = $scope.dir_selection.inode;
		var s = i.dir_state;
		if (s.sort_by === sort_by_ctime_up) {
			return 'icon-caret-up';
		} else if (s.sort_by === sort_by_ctime_down) {
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

	var inodes_list = $('#inodes_list');

	$scope.fb_pic_url = function(fbid) {
		return (!fbid || fbid == ' ') ? '' :
			'https://graph.facebook.com/' + fbid + '/picture';
	};

	$scope.inode_click = function(inode) {
		$scope.select(inode);
		inodes_list.focusWithoutScrolling();
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
	$scope.key_handler = function(event) {
		if (!inodes_list.is(':focus')) {
			return;
		}
		switch (event.which) {
			case 37: // left
				event.preventDefault();
				return false;
			case 38: // up
				event.preventDefault();
				return false;
			case 39: // right
				event.preventDefault();
				return false;
			case 40: // down
				event.preventDefault();
				return false;
			case 46: // delete
				event.preventDefault();
				return false;
			case 13: // enter
				event.preventDefault();
				return false;
			default:
				// console.log(event.which);
		}
	};

	$scope.inode_upload = function(inode) {
		if (inode.is_not_mine()) {
			return;
		}
		var inode_label = $('<div class="inode_label"></div').html(inode.make_inode_with_icon());
		var msg = $('<div></div>')
			.append('<p>Resume the upload of this file by choosing the source file</p>')
			.append(inode_label);
		$.nbconfirm(msg, {
			noButtonCaption: 'Close',
			yesButtonCaption: 'Resume The Upload',
			on_close: function() {
				// we kept this dialog open exactly to get here and nullify
				// the data field so that next upload operations will 
				// see it blank, and not assume this inode from before is relevant.
				$('#file_upload_input').data('inode_upload', null);
				console.log('inode_upload CLOSE');
			},
			on_confirm: function() {
				var dlg = this;
				console.log('inode_upload CONFIRM');
				var file_upload_input = $('#file_upload_input');
				file_upload_input.data('inode_upload', inode);
				file_upload_input.trigger('click');
				file_upload_input.on('change.inode_upload', function() {
					dlg.nbdialog('close');
				});
				// leave the dialog open so that onchange or on_close 
				// will nullify the inode_upload in file_upload_input.data!!
				return true;
			}
		});
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
// ShareModalCtrl
////////////////////////////////
////////////////////////////////

ShareModalCtrl.$inject = ['$scope'];

function ShareModalCtrl($scope) {

	var dlg = $('#share_modal');

	$scope.open = function(inode) {
		dlg.find('.inode_label').html(inode.make_inode_with_icon());
		// TODO this is hacky accessing dlg.scope() ...
		$scope.share_is_loading = true;
		$scope.share_inode = inode;
		inode.get_share_list().on('success', function(data) {
			$scope.share_list = data.list;
		}).on('all', function() {
			$scope.share_is_loading = false;
		});
		dlg.nbdialog('open', {
			modal: true,
			css: {
				height: "80%",
				width: 350
			}
		});
	};

	$scope.submit = function() {
		var inode = $scope.share_inode;
		var share_list = $scope.share_list;
		$scope.share_is_loading = true;
		inode.share(share_list).on('success', function(data) {
			$('#share_modal').nbdialog('close');
			if (inode.parent) {
				inode.parent.read_dir();
			}
		}).on('all', function() {
			$scope.share_is_loading = false;
		});
	};

	$scope.mklink = function() {
		var inode = $scope.share_inode;
		$scope.share_is_loading = true;
		inode.mklink().on('success', function(data) {
			$('#share_modal').nbdialog('close');
			console.log('mklink', data);
			var dlg = $('#getlink_dialog').clone();
			dlg.find('.inode_label').html(inode.make_inode_with_icon());
			dlg.find('.link_label').html(
				'<div style="height: 100%; word-wrap: break-word; word-break: break-all">' +
				window.location.host + data.url + '</div>');
			dlg.nbdialog('open', {
				remove_on_close: true,
				modal: false,
				css: {
					width: 300,
					height: 400
				}
			});
		}).on('all', function() {
			$scope.share_is_loading = false;
		});
	};

	$scope.rmlinks = function() {
		var inode = $scope.share_inode;
		$scope.share_is_loading = true;
		inode.rmlinks().on('success', function(data) {
			$('#share_modal').nbdialog('close');
			console.log('rmlinks', data);
			$.nbalert('Revoked!');
		}).on('all', function() {
			$scope.share_is_loading = false;
		});
	};
}



////////////////////////////////
////////////////////////////////
// UploadCtrl
////////////////////////////////
////////////////////////////////

UploadCtrl.$inject = ['$scope', 'nbUploadSrv'];

function UploadCtrl($scope, nbUploadSrv) {

	var upload_modal = $('#upload_modal');
	upload_modal.nbdialog({
		css: {
			width: "70%"
		}
	});

	$scope.has_uploads = function() {
		return nbUploadSrv.has_uploads();
	};


	nbUploadSrv.init_drop($(document));
	nbUploadSrv.init_file_input($('#file_upload_input'));
	nbUploadSrv.init_file_input($('#dir_upload_input'));
	nbUploadSrv.on_file_upload = function(event, file) {
		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			console.error('no selected dir, bailing');
			return;
		}
		if (dir_inode.is_shared_with_me()) {
			$.nbalert('Cannot upload to a shared folder');
			return;
		}
		if (dir_inode.is_not_mine() || dir_inode.owner_name) {
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

		// TODO: need to nullify the inode_upload on input file dialog cancel
		var inode_upload = $(event.target).data('inode_upload');
		var existing_inode_id = inode_upload ? inode_upload.id : null;
		var refresh_parent = function() {
			dir_inode.read_dir();
		};
		nbUploadSrv
			.add_upload(file, dir_inode, existing_inode_id)
			.then(refresh_parent, refresh_parent);
	};

}