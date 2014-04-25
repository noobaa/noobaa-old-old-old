var gulp = require('gulp');
var filter = require('gulp-filter');
var less = require('gulp-less');
var uglify = require('gulp-uglify');
var minify_css = require('gulp-minify-css');
var rename = require('gulp-rename');
var jshint = require('gulp-jshint');
var jshint_stylish = require('jshint-stylish');
var bower = require('gulp-bower');
var browserify = require('gulp-browserify');
var ng_template_cache = require('gulp-angular-templatecache');
var nodemon = require('gulp-nodemon')

var paths = {
	css: './src/css/**/*',
	views_ng: './src/views_ng/**/*',
	scripts: ['./src/server/**/*', './src/client/**/*'],
	server_main: './src/server/server.js',
	client_main: './src/client/main.js',
};

gulp.task('bower', function() {
	bower();
	// .pipe(gulp.dest('build/bower'));
});

gulp.task('css', function() {
	gulp.src(paths.css)
		.pipe(less())
		.pipe(minify_css())
		.pipe(gulp.dest('build/css'));
});

gulp.task('jshint', function() {
	gulp.src(paths.scripts)
		.pipe(filter('*.js'))
		.pipe(jshint())
		.pipe(jshint.reporter(jshint_stylish))
		.pipe(jshint.reporter('fail'));
});

gulp.task('js', ['bower', 'jshint'], function() {
	// single entry point to browserify
	gulp.src(paths.client_main)
		.pipe(browserify({
			insertGlobals: true,
			debug: true
		}))
		.pipe(uglify())
		.pipe(rename('bundle.js'))
		.pipe(gulp.dest('build/js'));
});

gulp.task('ng', function() {
	gulp.src(paths.views_ng)
		.pipe(ng_template_cache())
		.pipe(uglify())
		.pipe(gulp.dest('build/js'));
});


gulp.task('install', [
	'bower',
	'css',
	'jshint',
	'js',
	'ng'
]);


// gulp.task('watch', function() {
// gulp.watch(paths.scripts, ['jshint', 'js']);
// gulp.watch(paths.css, ['css']);
// gulp.watch(paths.client_main, ['js']);
// gulp.watch(paths.views_ng, ['ng']);
// });

gulp.task('nodemon', function() {
	nodemon({
		script: paths.server_main,
		watch: 'src/',
		ext: 'js less css html json',
		ignore: ['.git'],
		verbose: true,
	}).on('change', 'install').on('restart', function() {
		console.log('~~~ restart server ~~~')
	})
});

gulp.task('start_dev', [
	'install',
	'nodemon'
]);

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
