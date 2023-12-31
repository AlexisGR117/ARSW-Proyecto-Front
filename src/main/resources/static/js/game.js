const app = (function () {
    const module = apiClient;
    let stompClient = null;
    let gameCode = sessionStorage.getItem("gameCode")
    let currentPlayer = {name: sessionStorage.getItem('player')};
    let freeze = false;

    function createPlayerElement(player) {
        const { name, score, color } = player;
        const row = $('<div>').addClass(['row', 'player', 'm-2']);
        const col5_1 = $('<div>').addClass(['col']);
        const circle = $('<div>').addClass('circle').css('background-color', getRGBAColor(color));
        const col5_2 = $('<div>').addClass(['col', 'center-content']).text(name);
        const col2 = $('<div>').addClass(['col', 'center-content']).text(score);
        col5_1.append(circle);
        row.append(col5_1, col5_2, col2);
        $('#players').append(row);
    }

    function createPlayersElements(players) {
        $('#players').empty();
        const sortedPlayers = players.sort((a, b) => b.score - a.score);
        let paintedCells = 0;
        for (const player of sortedPlayers) {
            if (currentPlayer.name == player.name) currentPlayer = player;
            createPlayerElement(player);
            paintedCells += player.score;
        }
        const row = $('<div>').addClass(['row', 'player', 'm-2']);
        const col10 = $('<div>').addClass(['col', 'center-content']).text("Casillas pintadas");
        const col2 = $('<div>').addClass(['col', 'center-content']).text(paintedCells);
        row.append(col10, col2);
        $('#players').append(row);
    }

    function paintCell(data) {
        const player = data.players.find((player) => player.name === data.playerName);
        const x = data.x;
        const y = data.y;
        const newCell = $(`#row-${x}-column-${y}`);
        const playerCircle =  $(`#${data.playerName}`);
        const color = getRGBAColor(player.color);
        newCell.css('background-color', color);
        playerCircle.appendTo(newCell);
        if (data.wildcard == "PaintPump") {
            handlePaintPump(newCell, color, data.cells, data.playerName, x, y);
        } else if (data.wildcard == "Freeze") {
            handleFreeze(newCell, data.players, data.playerName);
        }
    }

    function handlePaintPump(newCell, color, cells, playerName, x, y) {
        for (let dc = -2; dc <= 2; dc++) for (let dr = -2; dr <= 2; dr++) {
            if (isInsideBoard(y+dr, x+dc, cells.length) && cells[x+dc][y+dr].paintedBy != null && cells[x+dc][y+dr].paintedBy.name == playerName) {
                $(`#row-${x+dc}-column-${y+dr}`).css('background-color', color);
            }
        }
        newCell.find("img").remove();
    }

    function handleFreeze(newCell, players, playerName) {
        for (const player of players) {
            if(player.name != playerName) {
                $(`#${player.name}`).css('border-radius', "0%");
            }
        }
        freeze = true;
        newCell.find("img").remove();
    }

    function isInsideBoard(x, y, size) {
        return 0 <= x && x < size && 0 <= y && y < size;
    }

    function unfreeze(players, playerName) {
        for (const player of players) {
            if(player.name != playerName) {
                $(`#${player.name}`).css('border-radius', "50%");
            }
        }
        freeze = false;
    }

    function placeWildcards(cells) {
        for (const cell of cells) {
            const cellBoard = $(`#row-${cell.x}-column-${cell.y}`);
            if (cellBoard.children().length === 0) {
                cellBoard.prepend(`<img class="wildcard ${cell.wildcard.type}" src="img/${cell.wildcard.type}.png">`);
            } else if (cellBoard.children().length === 1 && cellBoard.children().first().is("img") && !cellBoard.children().first().hasClass(`${cell.wildcard.type}`)) {
                cellBoard.empty();
                cellBoard.prepend(`<img class="wildcard ${cell.wildcard.type}" src="img/${cell.wildcard.type}.png">`);
            }
        }
    }

    function placeWinner(winner) {
        const loco = $("#winnerModalCenter");
        loco.modal({backdrop: 'static', keyboard: false})
        loco.modal('show');
        const winnerContent =  $("#winner");
        winnerContent.empty();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = [
            `<div class="alert alert-info alert-dismissible" role="alert">`,
            `   <div>Felicidades ${winner}, has ganado la partida.</div>`,
            "</div>",
        ].join("");
        winnerContent.append(wrapper);
    };

    function connectAndSubscribe() {
        console.info('Connecting to WS...');
        const socket = new SockJS('http://paintitgateway.eastus.cloudapp.azure.com/stompendpoint');
        stompClient = Stomp.over(socket);
        stompClient.connect({}, (frame) => {
            console.log('Connected: ' + frame);
            stompClient.subscribe(`/topic/updateboard.${gameCode}`, (eventbody) => {
                const data = JSON.parse(eventbody.body);
                paintCell(data);
                createPlayersElements(data.players);
                placeWildcards(data.cellsWithWildcards);
                updateRemainingMoves(data.remainingMoves);
                if (freeze && data.remainingFrozenMoves <= 0) unfreeze(data.players, data.playerName);
            });
            stompClient.subscribe(`/topic/gamefinished.${gameCode}`, (eventbody) => {
                const winner = eventbody.body;
                placeWinner(winner);
            });
        });
    }

    function disconect() {
        if (stompClient !== null) {
            stompClient.disconnect();
        }
        console.log("Disconnected");
    };

    function movePlayer(row, column) {
        const data = {
            playerName: currentPlayer.name,
            x: row,
            y: column,
            wildcard: null
        };
        const cell = $(`#row-${row}-column-${column}`);
        if (cell.children().first().hasClass("Freeze")) data.wildcard = "Freeze";
        else if (cell.children().first().hasClass("PaintPump")) data.wildcard = "PaintPump";
        stompClient.send("/app/newmovement." + gameCode, {}, JSON.stringify(data));
    }

    function keyDownEvents() {
       $(document).keydown(function(e) {
            const { LEFT_ARROW, UP_ARROW, RIGHT_ARROW, DOWN_ARROW } = { LEFT_ARROW: 37, UP_ARROW: 38, RIGHT_ARROW: 39, DOWN_ARROW: 40 };
            switch (e.which) {
                case LEFT_ARROW:
                    movePlayer(currentPlayer.x, currentPlayer.y - 1);
                    break;
                case UP_ARROW:
                    movePlayer(currentPlayer.x - 1, currentPlayer.y);
                    break;
                case RIGHT_ARROW:
                    movePlayer(currentPlayer.x, currentPlayer.y + 1);
                    break;
                case DOWN_ARROW:
                    movePlayer(currentPlayer.x + 1, currentPlayer.y);
                    break;
            }
        });
    }

    function getRGBAColor(color) {
        const { red, green, blue, alpha } = color;
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    }

    function createBoard(game) {
        const size = game.cells.length;
        const board = $("#game-board");
        board.css("gridTemplateRows", `repeat(${size}, ${100 / size}%)`);
        board.css("gridTemplateColumns", `repeat(${size}, ${100 / size}%)`);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const cell = $('<div>').addClass(['cell', 'center-content']);
                cell.attr("id", `row-${i}-column-${j}`)
                const player = game.cells[i][j].paintedBy;
                if (player != null) cell.css("background-color", getRGBAColor(player.color));
                board.append(cell);
            }
        }
        for (const player of game.players) {
            const initialCell = $(`#row-${player.x}-column-${player.y}`);
            initialCell.css('background-color', getRGBAColor(player.color));
            const circle2 = $('<div>').attr("id", player.name).addClass('circle-board');
            initialCell.append(circle2);
        }
    }

    function updateRemainingMoves(remainingMoves) {
        $('#moves').text(remainingMoves);
        if (remainingMoves === 50) $("#message").css("visibility", "visible");
        if (remainingMoves === 30) $("#message").css("visibility", "hidden");
    }

    function init() {
        connectAndSubscribe();
        module.getGame(gameCode)
            .then((game) => {
                console.log(game.players);
                createBoard(game);
                createPlayersElements(game.players);
                updateRemainingMoves(game.remainingMoves);
            });
        keyDownEvents();
    }

    return {
        init: init,

        exit: function () {
            disconect();
            location.href = "index.html";
        },
    };
})();