var gulp = require('gulp'),
    connect = require('gulp-connect'),
    sass = require('gulp-sass'),
    imagemin = require('gulp-imagemin'),
    autoprefix = require('gulp-autoprefixer'),
    neat = require('node-neat'),
    gulpif = require('gulp-if'),
    resize = require('gulp-image-resize'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    buffer = require('vinyl-buffer'),    
    flatmap = require('gulp-flatmap'),
    deploy = require('gulp-gh-pages'),
    combine = require('gulp-jsoncombine'),
    spritesmith = require('gulp.spritesmith'),
    screenshots = require('gulp-local-screenshots'),
    cityTimezones = require('city-timezones'),
    removeDiacritics = require('diacritics').remove,
    sequence = require('gulp-sequence'),    
    util = require('gulp-util'),
    data = require('gulp-data'),
    jade = require('gulp-jade'),
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

gulp.task('jade', function () {

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

    console.log("cancel.pug");

    gulp.src('./jade/cancel.pug')
        .pipe(gpug())
        .pipe(gulp.dest(publicDir))
        .pipe(connect.reload());

    var externalTrainings = [
      {
        "title": "Crafting Code",
        "date": "30 Nov – 1 Dec 2018",
        "location": "Riga, Latvia",
        "description": "This course is designed to help developers get better at Test-Driven Development and write well-crafted code—code that is clean, testable, maintainable, and an expression of the business domain. The course is entirely hands-on, designed to teach developers practical techniques they can immediately apply to real-world projects.",
        "link": {
          "name": "More info at DevTernity.com",
          "href": "https://devternity.com/"
        },
        "trainer": {
          "name": "Sandro Mancuso",
          "title": "Software Craftsman and Founder @ Codurance, author of The Software Craftsman",
          "twitter": "sandromancuso"
        }
      },
      {
        "title": "Programming with Kotlin",
        "date": "30 Nov – 1 Dec 2018",
        "location": "Riga, Latvia",
        "description": "Kotlin popularity is booming. The strength of Kotlin is that it has drawn from wonderful features that have been teased out and tried successfully in many languages. Kotlin provides sensible syntax and semantics to create highly concise code. It is a language that just feels right in many areas. This hands-on workshop walks you through the fundamentals and advanced concepts of Kotlin language.",
        "link": {
          "name": "More info at DevTernity.com",
          "href": "https://devternity.com/"
        },
        "trainer": {
          "name": "Venkat Subramaniam",
          "title": "Founder @ Agile Developer, Author of Practices of an Agile Developer, Programming Concurrency on the JVM, Functional Programming in Java",
          "twitter": "venkat_s"
        }
      },
      {
        "title": "Making Your Tests Rock",
        "date": "30 Nov – 1 Dec 2018",
        "location": "Riga, Latvia",
        "description": "This workshop is designed for developers willing to learn how to write automated tests that are fast, easy to read and fun to maintain. Are you beginning your TDD and BDD journey or already practicing TDD and BDD? Whatever the case, be ready to bring your tests to the next level!",
        "link": {
          "name": "More info at DevTernity.com",
          "href": "https://devternity.com/"
        },
        "trainer": {
          "name": "Jakub Nabrdalik",
          "title": "Trainer, Team Leader @ Allegro Group, ex-Head of Software Development @ 4Finance",
          "twitter": "jnabrdalik"
        }
      },
      {
        "title": "Jedi Techniques of Personal Effectiveness",
        "date": "30 Nov – 1 Dec 2018",
        "location": "Riga, Latvia",
        "description": "This practical workshop will equip you with necessary skills for accomplishing more, with less stress and efforts, and bring you closer to the work-life balance on a win-win basis. After the training, you will know how to achieve more at work and personal life simultaneously (instead of conventional view: “one at the expense of another”).",
        "link": {
          "name": "More info at DevTernity.com",
          "href": "https://devternity.com/"
        },
        "trainer": {
          "name": "Maxim Dorofeev",
          "title": "Founder @ mnogosdelal.ru, ex-Head of IT @ Kaspersky Lab, Author of Jedi Techniques",
          "twitter": "sandromancuso",
          "avatar": "https://devternity.com/images/dorofeev.png"
        }
      },
      {
        "title": "Production-ready Serverless: Operational Best Practices",
        "date": "30 Nov – 1 Dec 2018",
        "location": "Riga, Latvia",
        "description": "This course is designed to get you familiarised with the basics of AWS Lambda and the Serverless framework quickly, and then deep dive into the operational challenges with running a serverless architecture in production and the emerging patterns and practices to tackle them.",
        "link": {
          "name": "More info at DevTernity.com",
          "href": "https://devternity.com/"
        },
        "trainer": {
          "name": "Yan Cui",
          "title": "Developer, Software Architect, Trainer, Author of AWS Lambda in Motion",
          "twitter": "theburningmonk",
          "avatar": "https://devternity.com/images/cui.png"
        }
      },
      {
        "title": "Mastering Amazon Web Services (AWS)",
        "date": "30 Nov – 1 Dec 2018",
        "location": "Riga, Latvia",
        "description": "Amazon Web Services (AWS) is the world's leading provider of reliable, scalable, and inexpensive cloud computing services. The goal of this intensive, practical 2-day training is to familiarise you with the core AWS services and equip you with enough knowledge so you can choose, create, configure and maintain AWS infrastructure for your own projects. After this course, you'll gain deep understanding of AWS, learn how to operate production-grade AWS infrastructure and discover hidden tips and tricks from a certified AWS expert.",
        "link": {
          "name": "More info at DevTernity.com",
          "href": "https://devternity.com/"
        },
        "trainer": {
          "name": "Juris Pavlyuchenkov",
          "title": "Trainer, Amazon Certified Solutions Architect",
          "twitter": "jurispv",
          "avatar": "https://devternity.com/images/pavl.png"
        }
      }            
    ]

    var trainingsVisibleOnFrontPage = _.filter(_.concat(trainings, externalTrainings), function(training) {
        return !training.landing && !training.noExposure;
    });
    var allTrainings = _.filter(trainings, function(training) {
        return !training.noExposure;
    });

    console.log("index.pug");
    gulp.src('./jade/index.pug')
        .pipe(gpug({
            locals: {
                "trainings": trainingsVisibleOnFrontPage,
                "all_trainings": allTrainings
            }
        }))
        .pipe(gulp.dest(publicDir))
        .pipe(connect.reload());

    console.log("trainings.pug");

    trainings.forEach(function(tr) {
        var html = pug.renderFile('./jade/' + tr.templateDir + '/index.pug', _.extend(tr, {
            self: true, 
            cache: true
        }))
        fse.outputFileSync(publicDir + '/' + tr.url + '/index.html', html);
    })
});

gulp.task('uglify', function () {
    gulp.src(['js/jquery.min.js', 'js/main.js'])
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
    return gulp.src(['favicon.ico', 'robots.txt', 'CNAME'])
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
