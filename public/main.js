$(document).ready(function () {

    var console_output_1 = $("#console_output_1");
    var console_output_2 = $("#console_output_2");
    var InputTextBox = $("#InputTextBox");
    var InputTextBoxSend = $("#InputTextBoxSend");

    var socket = io.connect('http://ivantomic.com:8082');

    var inputData = {};
    var console_lines_1 = 1;
    var console_lines_2 = 1;
    var client = {};

    // Register Client
    socket.emit('register', {
        'data': client
    });

    InputTextBoxSend.click(function () {

        inputData.content = InputTextBox.val();
        if (inputData.content.length > 15) {
            socket.emit('process', {
                'value': inputData.content,
                'client_id': client.id
            });
        } else {
            console("Please enter a little bit larger input!\r\nLets say at least 5 words! txn", 1);
        }
    });

    socket.on('welcome', function (data) {
        console('CLEAR', 1);
        console(data.message, 1);
        var temp = "\n\t";
        client.id = data.guid;

        data.available_datasets.forEach(function (dataset) {
            temp = temp + "-> " + dataset + "\n\t";
        });
        console("Following datasets are loaded: " + temp, 1);
    });

    socket.on('console_output', function (data) {
        console(data.message, 1);
    });
    socket.on('actions', function (data) {
        console('CLEAR', 1);
    });

    socket.on('system', function (data) {
        console(data.message, 2);
    });

    function console(string, type) {
        var console_out;
        if (type === 1) {
            console_out = console_output_1;
            if (string === 'CLEAR') {
                console_lines_1 = 0;
                console_out.html("");
            } else {
                $("<div class=\"console_line\"><span id=\"console_no\">" + console_lines_1 + ".</span><span id=\"console_txt\">" + string + "</span></div>\n").appendTo(console_out);
            }
            console_out.scrollTop = console_out.scrollHeight;
            console_lines_1++;

        } else if (type === 2) {
            console_out = console_output_2;
            if (string === 'CLEAR') {
                console_lines_2 = 0;
                console_out.html("");
            } else {
               $("<div class=\"console_line\"><span id=\"console_no\">" + console_lines_2 + ".</span><span id=\"console_txt\">" + string + "</span></div>\n").appendTo(console_out);
            }
            console_out.scrollTop(console_out.scrollHeight);
            console_lines_2++;
        }


    }

    $(".demoText").click(function () {
        var demoID = $(this).attr('data-id');
        loadSample(demoID);
    });

    function loadSample(demoID) {
        var url = "samples/" + demoID + ".txt";
        $.get(url, function (data) {
            $("#InputTextBox").val(data);
        });
    }

});