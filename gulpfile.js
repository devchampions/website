
var gulp = require('gulp'),
    connect = require('gulp-connect'),
    sass = require('gulp-sass'),
    autoprefix = require('gulp-autoprefixer'),
    neat = require('node-neat'),
    gulpif = require('gulp-if'),
    resize = require('gulp-image-resize'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    buffer = require('vinyl-buffer'),    
    deploy = require('gulp-gh-pages'),
    spritesmith = require('gulp.spritesmith'),
    cityTimezones = require('city-timezones'),
    removeDiacritics = require('diacritics').remove,
    sequence = require('gulp-sequence'),    
    gpug = require('gulp-pug'),    
    moment = require('moment'),    
    glob = require('glob'),
    path = require('path'),
    fse = require('fs-extra'),    
    pug = require('pug'),
    _ = require('lodash');

var publicDir = 'www';

gulp.task('connect', function () {
    connect.server({
        root: publicDir,
        port: 9012,
        livereload: false
    });
});

gulp.task('build', function () {
    gulp.run('buildSequence');
});

gulp.task('buildSequence', sequence('img', 'sass', 'jade', 'uglify', 'fonts', 'copy'));

gulp.task('img', function () {

    var sprites = gulp.src('img/trainers/*.png')
        .pipe(spritesmith({
            imgName: 'trainers.png',
            imgPath: '/img/trainers.png',
            cssName: 'trainers.css'
        }));

    sprites.img
        .pipe(buffer())
        .pipe(gulpif('trainers/*', resize({
            imageMagick: true,
            width: 100,
            height: 100,
            crop: true,
            upscale: true
        })))
        // .pipe(imagemin())
        .pipe(gulp.dest(publicDir + '/img'));

    sprites.css
        .pipe(gulp.dest(publicDir + '/css'));

    gulp.src('img/**/*.{png,jpg,svg}')
        // .pipe(imagemin())
        .pipe(gulp.dest(publicDir + '/img'));
});

gulp.task('sass', function () {
    gulp.src('sass/*.scss')
        .pipe(sass({
            includePaths: neat.includePaths
        }))
        .pipe(autoprefix('last 10 version'))
        .pipe(gulp.dest(publicDir + '/css'))
        .pipe(connect.reload());
});

gulp.task('jade', async () => {

    var trainings = function () {
        var files = glob.sync("jade/training/*/index.json");
        return _.chain(files)
            // removing hidden training
            .filter(function(file) {
                return !_.includes(path.dirname(file), '__');
            })
            // generating multi-edition trainings (e.g. Java 8 & Java 9)
            .map(function(file) {
                var json = require('./' + file);
                var parentDir = "training/" + path.dirname(file).split("/")[2];
                if (json.editions) {
                    return _.map(json.editions, function(edition) {
                        return _.extend({templateDir: parentDir}, json, edition);
                    })
                } else {
                    return _.extend({templateDir: parentDir}, json, {url: parentDir});
                }                
            })
            .flatMap()
            // generating multi-landing trainings for different locations
            .map(function(training) {
                var landings = _.map(training.landings ? training.landings.locations : [], function(it) {
                    var city = it.location.split(',')[0].trim();
                    var timezones = cityTimezones.lookupViaCity(city);
                    if (!timezones.length) {
                        console.log("Timezone cannot be resolved for " + city)
                    }
                    return _.extend({}, training, { 
                        date : it.date,
                        url: training.url + '/' + removeDiacritics(city.toLowerCase()),
                        location: it.location,
                        landing: true 
                    });
                });
                return _.concat(landings, training);
            })
            .flatMap()
            // generating landing pages for different dates
            .map(function(training) {
                if (training.landing) {
                    return _.flatMap(training.landings.dates, function(it) {
                        var month = it.date.match(/([A-Za-z]+)/)[0].toLowerCase();
                        var dates = it.date.match(/([0-9]{2})/g);
                        var url = training.url + '/' + month;
                        if (it.main) {
                            return [                        
                                _.extend({}, training, {
                                    date : it.date,
                                    url: url
                                }),
                                _.extend({}, training, {
                                    date : it.date,
                                    url: url + "/" + dates[0] + "/" + dates[1]
                                })                            
                            ]
                        } else {
                            return [                        
                                _.extend({}, training, {
                                    date : it.date,
                                    url: url + "/" + dates[0] + "/" + dates[1]
                                })                            
                            ]                            
                        }
                    })
                } else {
                    // console.log("Generating a training at " + training.url);
                    return training;
                }
            })
            .flatMap()
            .map(function(json) {
                if (!json.date) {
                    return json;
                }
                var allParts = json.date.split(' ')
                var days = allParts[0].split('-')
                var month = allParts[1]
                var year = allParts[2]
                return _.extend({}, json, {
                    from_iso: moment(days[0] + month + year, 'DD MMMM YYYY').format('YYYY-MM-DD'),
                    to_iso: moment(days[1] + month + year, 'DD MMMM YYYY').format('YYYY-MM-DD')
                })
            })
            .map(function(json) {
                if (!json.location) {
                    return json
                }

                var parts = json.location.split(',')
                if (parts.length != 2) {
                    return json                    
                }
                return _.extend({}, json, {
                    city: removeDiacritics(parts[0].trim()),
                    country: removeDiacritics(parts[1].trim())
                })                

            })
            .sortBy(function(json) {
                var date = json.date;
                if (json.locations) {
                    date = json.locations[0].date;
                }
                return moment(date, 'DD MMMM YYYY').unix()
            })
            .uniqBy('url')
            .value();
    }();

    gulp.src('./jade/cancel.pug')
        .pipe(gpug())
        .pipe(gulp.dest(publicDir))
        .pipe(connect.reload());

    const { events } = require("./devternityEvents")    
    const externalTrainings = await events()

    var trainingsVisibleOnFrontPage = _.filter(_.concat(trainings, externalTrainings), function(training) {
        return !training.landing && !training.noExposure;
    });
    var allTrainings = _.filter(trainings, function(training) {
        return !training.noExposure;
    });

    gulp.src('./jade/index.pug')
        .pipe(gpug({
            locals: {
                "trainings": trainingsVisibleOnFrontPage,
                "all_trainings": allTrainings
            }
        }))
        .pipe(gulp.dest(publicDir))
        .pipe(connect.reload());

    trainings.forEach(function(tr) {
        var html = pug.renderFile('./jade/' + tr.templateDir + '/index.pug', _.extend(tr, {
            self: true, 
            cache: true
        }))
        fse.outputFileSync(publicDir + '/' + tr.url + '/index.html', html);
    })
});

gulp.task('uglify', function () {
    gulp.src(['js/jquery.min.js', 'js/jquery.inview.min.js', 'js/ofi.min.js', 'js/main.js'])
        .pipe(concat('main.js'))
        .pipe(uglify())
        .pipe(gulp.dest(publicDir + '/js'))
        .pipe(connect.reload());
});

gulp.task('fonts', function () {
    return gulp.src(['fonts/*'])
        .pipe(gulp.dest(publicDir + '/fonts'))
});

gulp.task('copy', function () {
    return gulp.src(['favicon.ico', 'coding.mp4', 'robots.txt', 'CNAME'])
        .pipe(gulp.dest(publicDir))
        .pipe(connect.reload());
});

gulp.task('watch', function () {
    gulp.watch(['js/*.js', 'js/**/*.js'], ['uglify']);
    gulp.watch(['img/*', 'img/**/*'], ['img']);
    gulp.watch(['sass/*.scss', 'sass/**/*.scss'], ['sass']);
    gulp.watch(['jade/*.pug', 'jade/**/*.pug', 'jade/*.json', 'jade/**/*.json'], ['jade']);
    gulp.watch(['favicon.ico', 'robots.txt'], ['copy']);
});

gulp.task('default', ['connect', 'build']);

gulp.task('deploy', function () {
    var options = {
        remoteUrl: "git@github.com:devchampions/website.git",
        branch: "gh-pages"
    };
    return gulp.src(['./www/**/*'])
        .pipe(deploy(options));
});
