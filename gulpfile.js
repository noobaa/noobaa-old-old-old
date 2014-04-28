var gulp = require('gulp');
var gulp_util = require('gulp-util');
var gulp_debug = require('gulp-debug');
var gulp_size = require('gulp-size');
var gulp_concat = require('gulp-concat');
var gulp_replace = require('gulp-replace');
var gulp_cached = require('gulp-cached');
var gulp_newer = require('gulp-newer');
var gulp_filter = require('gulp-filter');
var gulp_less = require('gulp-less');
var gulp_uglify = require('gulp-uglify');
var gulp_minify_css = require('gulp-minify-css');
var gulp_rename = require('gulp-rename');
var gulp_bower = require('gulp-bower');
var gulp_ng_template = require('gulp-angular-templatecache');
var gulp_jshint = require('gulp-jshint');
var jshint_stylish = require('jshint-stylish');
var vinyl_buffer = require('vinyl-buffer');
var vinyl_source_stream = require('vinyl-source-stream');
var browserify = require('browserify');
var event_stream = require('event-stream');
var path = require('path');
var child_process = require('child_process');
var dotenv = require('dotenv');

if (!process.env.PORT) {
	console.log('loading .env file ( no foreman ;)');
	dotenv.load();
}

var paths = {
	css: './src/css/**/*',
	views_ng: './src/views_ng/**/*',
	scripts: ['./src/server/**/*', './src/client/**/*', './gulpfile.js'],
	server_main: './src/server/server.js',
	client_main: './src/client/main.js',
	client_externals: [
		'./bower_components/bootstrap/dist/js/bootstrap.min.js',
		'./node_modules/masonry.js/dist/masonry.pkgd.min.js',
		'./bower_components/alertify.js/lib/alertify.min.js',
		'./vendor/flowplayer-5.4.6/flowplayer.js',
	]
};

function gulp_size_log(title) {
	return gulp_size({
		title: title
	});
}

gulp.task('bower', function() {
	return gulp_bower();
});

gulp.task('css', function() {
	var DEST = 'build/public/css';
	var NAME = 'styles.css';
	var NAME_MIN = 'styles.min.css';
	return gulp.src(paths.css)
		.pipe(gulp_newer(path.join(DEST, NAME)))
		.pipe(gulp_less())
		.pipe(gulp_rename(NAME))
		.pipe(gulp_size_log(NAME))
		.pipe(gulp.dest(DEST))
		.pipe(gulp_minify_css())
		.pipe(gulp_rename(NAME_MIN))
		.pipe(gulp_size_log(NAME_MIN))
		.pipe(gulp.dest(DEST));
});

gulp.task('jshint', function() {
	return gulp.src(paths.scripts)
		.pipe(gulp_filter('*.js'))
		.pipe(gulp_cached('jshint'))
		.pipe(gulp_jshint())
		.pipe(gulp_jshint.reporter(jshint_stylish))
		.pipe(gulp_jshint.reporter('fail'));
});

gulp.task('ng', function() {
	var DEST = 'build/';
	var NAME = 'templates.js';
	return gulp.src(paths.views_ng)
		.pipe(gulp_newer(path.join(DEST, NAME)))
		.pipe(gulp_ng_template())
		.pipe(gulp_size_log(NAME))
		.pipe(gulp.dest(DEST));
});

gulp.task('js', ['bower', 'jshint', 'ng'], function() {
	var DEST = 'build/public/js';
	var NAME = 'bundle.js';
	var NAME_MIN = 'bundle.min.js';
	var bundler = browserify(paths.client_main);
	var bundle_options = {
		// bare is alias for both --no-builtins, --no-commondir, 
		// and sets --insert-global-vars to just "__filename,__dirname". 
		// This is handy if you want to run bundles in node.
		bare: true,
		detectGlobals: false,
		list: true,
		debug: true
	};
	// using gulp_replace to fix collision of requires
	var client_bundle_stream = bundler.bundle(bundle_options)
		.pipe(vinyl_source_stream(NAME))
		.pipe(vinyl_buffer())
		.pipe(gulp_replace(/\brequire\b/g, 'require_browserify'))
		.pipe(gulp_replace(/\brequire_node\b/g, 'require'));
	var client_merged_stream = event_stream.merge(
		client_bundle_stream,
		gulp.src(paths.client_externals)
	);
	return client_merged_stream
		.pipe(gulp_concat(NAME))
		.pipe(gulp_size_log(NAME))
		.pipe(gulp.dest(DEST))
		.pipe(gulp_cached(NAME))
		.pipe(gulp_uglify())
		.pipe(gulp_rename(NAME_MIN))
		.pipe(gulp_size_log(NAME_MIN))
		.pipe(gulp.dest(DEST));
});


gulp.task('install', ['css', 'js']);


var active_server;

function serve() {
	if (active_server) {
		console.log(' ');
		console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
		console.log('~~~      KILL SERVER       ~~~ (pid=' + active_server.pid + ')');
		console.log('~~~ (wait exit to respawn) ~~~');
		console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
		console.log(' ');
		active_server.kill();
		return;
	}
	console.log(' ');
	console.log('~~~~~~~~~~~~~~~~~~~~~~');
	console.log('~~~  START SERVER  ~~~');
	console.log('~~~~~~~~~~~~~~~~~~~~~~');
	console.log(' ');
	active_server = child_process.fork(
		path.basename(paths.server_main), [], {
			cwd: path.dirname(paths.server_main)
		}
	);
	active_server.on('error', function(err) {
		console.error(' ');
		console.error('~~~~~~~~~~~~~~~~~~~~~~');
		console.error('~~~  SERVER ERROR  ~~~', err);
		console.error('~~~~~~~~~~~~~~~~~~~~~~');
		console.error(' ');
		gulp_util.beep();
	});
	active_server.on('exit', function(code, signal) {
		console.error(' ');
		console.error('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
		console.error('~~~       SERVER EXIT       ~~~ (rc=' + code + ')');
		console.error('~~~  (respawn in 1 second)  ~~~');
		console.error('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
		console.error(' ');
		active_server = null;
		setTimeout(serve, 1);
	});
	gulp_util.beep();
}


gulp.task('serve', ['install'], serve);

gulp.task('start_dev', ['serve'], function() {
	return gulp.watch('src/**/*', ['serve']);
});

gulp.task('start_prod', function() {
	console.log('~~~ START PROD ~~~');
	require(paths.server_main);
});

if (process.env.DEV_MODE === 'dev') {
	gulp.task('start', ['start_dev']);
} else {
	gulp.task('start', ['start_prod']);
}

gulp.task('default', ['start']);
