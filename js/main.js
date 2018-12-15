$(document).ready(function() {
	$('a[href^="#"]').click(function() {
		$('html, body').animate({
	        scrollTop: $( $.attr(this, 'href') ).offset().top
	    }, 500);
	    return false;	    
	});


});

$(document).ready(function() {
	$('#champion').click(function() {
		$('html, body').animate({
	        scrollTop: $('#trainings').offset().top
	    }, 500);
	    return false;	    
	});
});

$(document).ready(function() {
	objectFitImages()
})