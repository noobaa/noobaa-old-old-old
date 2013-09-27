/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
// TODO: how do we fix this warning? - "Use the function form of "use strict". (W097)"
/* jshint -W097 */
'use strict';

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
	var promise = this.load_dir();
	if (!promise) {
		callback( !! me.dir_state.sons_list.length);
	} else {
		promise.then(function(res) {
			callback( !! me.dir_state.sons_list.length);
			return res;
		}, function(err) {
			callback( !! me.dir_state.sons_list.length);
			throw err;
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
	this.dir_state.refreshing = this.$scope.$http({
		method: 'GET',
		url: this.$scope.inode_api_url + this.id
	}).then(function(res) {
		delete me.dir_state.refreshing;
		me.populate_dir(res.data.entries);
		return res;
	}, function(err) {
		delete me.dir_state.refreshing;
		throw err;
	});
	return this.dir_state.refreshing;
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
		sync_property(son, ent, "owner");

		//get only the first name for display. Cleaner and friendlier.
		if (son.owner && son.owner.name) {
			son.owner.name = son.owner.name.split(' ')[0];
		}
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
	return this.$scope.$http({
		method: 'POST',
		url: this.$scope.inode_api_url,
		data: {
			id: this.id,
			name: name,
			isdir: true
		}
	}).then(function(res) {
		me.read_dir();
		return res;
	}, function(err) {
		me.read_dir();
		throw err;
	});
};

// delete this inode
Inode.prototype.delete_inode = function(del_scope, avoid_read_parent) {
	var me = this;
	var do_delete = function() {
		del_scope.concurrency++;
		return me.$scope.$http({
			method: 'DELETE',
			url: me.$scope.inode_api_url + me.id
		}).then(function() {
			del_scope.concurrency--;
			del_scope.count++;
		});
	};
	var promise;
	if (me.isdir) {
		del_scope.concurrency++;
		promise = me.read_dir().then(function() {
			del_scope.concurrency--;
			var sons = me.dir_state.sons_list.slice(0); // copy array
			var delete_sons = function() {
				if (!sons || !sons.length) {
					return me.$scope.$q.when();
				}
				var promises = [];
				while (del_scope.concurrency < del_scope.max_concurrency && sons.length) {
					promises.push(sons.pop().delete_inode(del_scope, true));
				}
				return me.$scope.$q.all(promises).then(delete_sons);
			};
			return delete_sons();
		}).then(do_delete);
	} else {
		promise = do_delete();
	}
	// when recursing don't read parent
	if (avoid_read_parent) {
		return promise;
	}
	return promise.then(function(res) {
		me.parent.read_dir();
		return res;
	}, function(err) {
		me.parent.read_dir();
		throw err;
	});
};

// rename this inode to the given target dir,name
Inode.prototype.rename = function(to_parent, to_name) {
	var me = this;
	var parent = this.parent;
	return this.$scope.$http({
		method: 'PUT',
		url: this.$scope.inode_api_url + this.id,
		data: {
			parent: to_parent.id,
			name: to_name
		}
	}).then(function(res) {
		to_parent.read_dir();
		parent.read_dir();
		return res;
	}, function(err) {
		to_parent.read_dir();
		parent.read_dir();
		throw err;
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
	return this.$scope.$http({
		method: 'GET',
		url: this.$scope.inode_api_url + this.id
	}).then(function(res) {
		console.log(res.data.s3_get_url);
		var win = window.open(res.data.s3_get_url, '_blank');
		win.focus();
	});
	*/
};

Inode.prototype.get_share_list = function() {
	console.log('get_share_list', this);
	return this.$scope.$http({
		method: 'GET',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_share_sufix
	});
};

Inode.prototype.share = function(share_list) {
	console.log('share', this, 'with', share_list);
	return this.$scope.$http({
		method: 'PUT',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_share_sufix,
		data: {
			share_list: share_list
		}
	});
};

Inode.prototype.mklink = function(link_options) {
	console.log('mklink', this, link_options);
	return this.$scope.$http({
		method: 'POST',
		url: this.$scope.inode_api_url + this.id + this.$scope.inode_link_sufix,
		data: {
			link_options: link_options
		}
	});
};

Inode.prototype.rmlinks = function() {
	console.log('revoke_links', this);
	return this.$scope.$http({
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

MyDataCtrl.$inject = ['$scope', '$http', '$timeout', '$window', '$q', '$rootScope', '$compile'];

function MyDataCtrl($scope, $http, $timeout, $window, $q, $rootScope, $compile) {

	$scope.timeout = $timeout;
	$scope.api_url = "/star_api/";
	$scope.inode_api_url = $scope.api_url + "inode/";
	$scope.inode_share_sufix = "/share_list";
	$scope.inode_link_sufix = "/link";
	$scope.$q = $q;
	$scope.$rootScope = $rootScope;
	$scope.$http = function(req) {
		console.log('[http]', req);
		return $http(req).then(function(res) {
			console.log('[http ok]', [req, res]);
			return res;
		}, function(err) {
			console.error(err.data || 'http request failed', [req, err]);
			throw err;
		});
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

	$scope.get_pic_url = function(user) {
		if (!user) {
			return;
		}
		if (user.fbid) {
			return 'https://graph.facebook.com/' + user.fbid + '/picture';
		}
		if (user.googleid) {
			return 'https://plus.google.com/s2/photos/profile/' + user.googleid + '?sz=50';
		}
	};

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
		dir_inode.read_dir().then(function(res) {
			cancel_curr_dir_refresh();
			$scope.curr_dir_refresh_timeout =
				$timeout(curr_dir_refresh, 60000);
			return res;
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
			drag_inode.rename(drop_inode, drag_inode.name).then(function() {
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

	$scope.open_local_planet = function() {
		$http({
			method: 'GET',
			url: '/star_api/device/current/'
		}).then(function(res) {
			console.log('LOCAL PLANET', res.data);
			var local_planet = res.data ? res.data.device : null;
			if (!local_planet || !local_planet.srv_port) {
				throw 'NO PLANET';
			}
			return $http({
				method: 'GET',
				url: 'http://127.0.0.1:' + local_planet.srv_port
			});
		}).then(function(res) {
			if (res.data.trim() !== 'NBOK') {
				throw ('UNEXPECTED PLANET RESPONSE' + res.data);
			}
			// ok, so close the upload dialog
			$('#upload_modal').nbdialog('close');
		}).then(null, function(err) {
			console.log(err);
			$scope.click_coshare();
		});
	};

	$scope.click_upload = function() {
		$('#upload_modal').nbdialog('open');
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
		inode.is_dir_non_empty(function(is_dir_non_empty) {
			var dlg = $('#delete_dialog').clone();
			if (is_dir_non_empty) {
				dlg.find('#not_empty_msg').css('display', 'block');
				dlg.find('#normal_msg').css('display', 'none');
			}
			var del_scope = $scope.$new();
			del_scope.count = 0;
			del_scope.concurrency = 0;
			del_scope.max_concurrency = 32;
			dlg.find('.inode_label').html(inode.make_inode_with_icon());
			dlg.find('#dialog_ok').off('click').on('click', function() {
				dlg.find('button.nbdialog_close').text('Hide');
				dlg.find('a.nbdialog_close').attr('title', 'Hide');
				dlg.find('#dialog_ok')
					.addClass('disabled')
					.empty()
					.append($('<i class="icon-spinner icon-spin icon-large icon-fixed-width"></i>'))
					.append($compile('<span style="padding-left: 20px">Deleted {{count}}</span>')(del_scope));
				var on_delete = function() {
					if (inode.id == $scope.inode_selection.inode.id) {
						$scope.select(inode.parent, {
							dir: true,
							open_dir: true
						});
					}
					dlg.nbdialog('close');
					del_scope.$destroy();
				};
				inode.delete_inode(del_scope).then(on_delete, on_delete);
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
		inode.get_share_list().then(function(res) {
			$scope.share_is_loading = false;
			$scope.share_list = res.data.list;
		}, function() {
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
		inode.share(share_list).then(function(res) {
			$scope.share_is_loading = false;
			$('#share_modal').nbdialog('close');
			if (inode.parent) {
				inode.parent.read_dir();
			}
		}, function() {
			$scope.share_is_loading = false;
		});
	};

	$scope.mklink = function() {
		var inode = $scope.share_inode;
		$scope.share_is_loading = true;
		inode.mklink().then(function(res) {
			$scope.share_is_loading = false;
			$('#share_modal').nbdialog('close');
			console.log('mklink', res.data);
			var dlg = $('#getlink_dialog').clone();
			dlg.find('.inode_label').html(inode.make_inode_with_icon());
			dlg.find('.link_label').html(
				'<div style="height: 100%; word-wrap: break-word; word-break: break-all">' +
				window.location.host + res.data.url + '</div>');
			dlg.nbdialog('open', {
				remove_on_close: true,
				modal: false,
				css: {
					width: 300,
					height: 400
				}
			});
		}, function() {
			$scope.share_is_loading = false;
		});
	};

	$scope.rmlinks = function() {
		var inode = $scope.share_inode;
		$scope.share_is_loading = true;
		inode.rmlinks().then(function(res) {
			$scope.share_is_loading = false;
			$('#share_modal').nbdialog('close');
			console.log('rmlinks', res.data);
			$.nbalert('Revoked!');
		}, function() {
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


	nbUploadSrv.setup_drop($(document));
	nbUploadSrv.setup_file_input($('#file_upload_input'));
	nbUploadSrv.setup_file_input($('#dir_upload_input'));

	nbUploadSrv.get_upload_target = function(event) {
		// make sure the modal shows - this is needed when drop/paste
		// and the modal is hidden.
		if (!event.upload_modal_open) {
			upload_modal.nbdialog('open');
			event.upload_modal_open = true;
		}

		// see inode_upload()
		var inode_upload = $(event.target).data('inode_upload');
		if (inode_upload) {
			return {
				inode_id: inode_upload.id
			};
		}

		var dir_inode = $scope.dir_selection.inode;
		if (!dir_inode) {
			console.error('no selected dir, bailing');
			return false;
		}
		if (dir_inode.is_shared_with_me()) {
			$.nbalert('Cannot upload to a shared folder');
			return false;
		}
		if (dir_inode.is_not_mine() || dir_inode.owner_name) {
			$.nbalert('Cannot upload to someone else\'s folder');
			return false;
		}
		return {
			dir_inode_id: dir_inode.id
		};
	};

	nbUploadSrv.on_file_upload = function(upload) {
		// TODO: avoid refresh per file...
		$scope.dir_selection.inode.read_dir();
	};

}