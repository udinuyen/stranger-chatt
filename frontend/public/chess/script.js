      "use strict";
      /* ================= Chess engine ================= */
      // Board: array 64, index 0 = a8 ... 63 = h1. Pieces: 'PNBRQK' white, lowercase black.
      var VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
      var GLYPH = {
        K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
        k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟"
      };
      var PST = {
        p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
        n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
        b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
        r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
        q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
        k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
      };
      function isWhite(p) { return p && p === p.toUpperCase(); }
      function colorOf(p) { return isWhite(p) ? "w" : "b"; }
      function opp(c) { return c === "w" ? "b" : "w"; }
      function fileOf(sq) { return sq % 8; }
      function rankOf(sq) { return (sq / 8) | 0; } // 0 = rank 8
      function sqName(sq) { return "abcdefgh"[fileOf(sq)] + (8 - rankOf(sq)); }

      function initialState() {
        var b = new Array(64).fill(null);
        var back = ["r","n","b","q","k","b","n","r"];
        for (var f = 0; f < 8; f++) {
          b[f] = back[f]; b[8 + f] = "p";
          b[48 + f] = "P"; b[56 + f] = back[f].toUpperCase();
        }
        return { board: b, turn: "w", castling: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0, full: 1 };
      }
      function cloneState(s) {
        return { board: s.board.slice(), turn: s.turn,
          castling: { K: s.castling.K, Q: s.castling.Q, k: s.castling.k, q: s.castling.q },
          ep: s.ep, half: s.half, full: s.full };
      }
      function posKey(s) {
        var k = s.turn + "|" + (s.castling.K?"K":"") + (s.castling.Q?"Q":"") + (s.castling.k?"k":"") + (s.castling.q?"q":"") + "|" + s.ep + "|";
        for (var i = 0; i < 64; i++) k += s.board[i] || ".";
        return k;
      }
      function attacked(b, sq, by) {
        var f = fileOf(sq), r = rankOf(sq);
        // pawns
        var pr = by === "w" ? r + 1 : r - 1;
        if (pr >= 0 && pr < 8) {
          var pawn = by === "w" ? "P" : "p";
          for (var df = -1; df <= 1; df += 2) {
            var pf = f + df;
            if (pf >= 0 && pf < 8 && b[pr * 8 + pf] === pawn) return true;
          }
        }
        // knights
        var kn = by === "w" ? "N" : "n";
        var kd = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (var i = 0; i < 8; i++) {
          var nf = f + kd[i][0], nr = r + kd[i][1];
          if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && b[nr * 8 + nf] === kn) return true;
        }
        // king
        var kg = by === "w" ? "K" : "k";
        for (var df2 = -1; df2 <= 1; df2++) for (var dr2 = -1; dr2 <= 1; dr2++) {
          if (!df2 && !dr2) continue;
          var kf = f + df2, kr = r + dr2;
          if (kf >= 0 && kf < 8 && kr >= 0 && kr < 8 && b[kr * 8 + kf] === kg) return true;
        }
        // sliders
        var dirs = [
          { d: [[1,0],[-1,0],[0,1],[0,-1]], t: ["r","q"] },
          { d: [[1,1],[1,-1],[-1,1],[-1,-1]], t: ["b","q"] }
        ];
        for (var g = 0; g < 2; g++) {
          for (var j = 0; j < 4; j++) {
            var cf = f, cr = r;
            while (true) {
              cf += dirs[g].d[j][0]; cr += dirs[g].d[j][1];
              if (cf < 0 || cf > 7 || cr < 0 || cr > 7) break;
              var p = b[cr * 8 + cf];
              if (!p) continue;
              if (colorOf(p) === by && dirs[g].t.indexOf(p.toLowerCase()) >= 0) return true;
              break;
            }
          }
        }
        return false;
      }
      function kingSq(b, c) {
        var k = c === "w" ? "K" : "k";
        for (var i = 0; i < 64; i++) if (b[i] === k) return i;
        return -1;
      }
      function inCheck(s, c) { return attacked(s.board, kingSq(s.board, c), opp(c)); }

      function pseudoMoves(s, capturesOnly) {
        var b = s.board, moves = [], turn = s.turn;
        function push(from, to, opt) {
          var m = { from: from, to: to, piece: b[from], captured: (opt && opt.ep) ? (turn === "w" ? "p" : "P") : b[to],
                    promo: opt && opt.promo, ep: !!(opt && opt.ep), dbl: !!(opt && opt.dbl), castle: opt && opt.castle };
          moves.push(m);
        }
        for (var sq = 0; sq < 64; sq++) {
          var p = b[sq];
          if (!p || colorOf(p) !== turn) continue;
          var f = fileOf(sq), r = rankOf(sq), t = p.toLowerCase();
          if (t === "p") {
            var dir = turn === "w" ? -1 : 1;
            var startRank = turn === "w" ? 6 : 1;
            var promoRank = turn === "w" ? 0 : 7;
            var oneR = r + dir;
            if (!capturesOnly) {
              if (oneR >= 0 && oneR < 8 && !b[oneR * 8 + f]) {
                if (oneR === promoRank) { ["q","r","b","n"].forEach(function(pr){ push(sq, oneR * 8 + f, { promo: pr }); }); }
                else push(sq, oneR * 8 + f);
                if (r === startRank && !b[(r + 2 * dir) * 8 + f]) push(sq, (r + 2 * dir) * 8 + f, { dbl: true });
              }
            }
            for (var df = -1; df <= 1; df += 2) {
              var cf = f + df, cr = r + dir;
              if (cf < 0 || cf > 7 || cr < 0 || cr > 7) continue;
              var tsq = cr * 8 + cf, tp = b[tsq];
              if (tp && colorOf(tp) !== turn) {
                if (cr === promoRank) { ["q","r","b","n"].forEach(function(pr2){ push(sq, tsq, { promo: pr2 }); }); }
                else push(sq, tsq);
              } else if (tsq === s.ep) {
                push(sq, tsq, { ep: true });
              }
            }
          } else if (t === "n" || t === "k") {
            var ds = t === "n" ? [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]
                               : [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            for (var i = 0; i < ds.length; i++) {
              var nf = f + ds[i][0], nr = r + ds[i][1];
              if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
              var tp2 = b[nr * 8 + nf];
              if (!tp2) { if (!capturesOnly) push(sq, nr * 8 + nf); }
              else if (colorOf(tp2) !== turn) push(sq, nr * 8 + nf);
            }
            if (t === "k" && !capturesOnly) {
              var home = turn === "w" ? 60 : 4;
              if (sq === home && !inCheck(s, turn)) {
                var enemy = opp(turn);
                if ((turn === "w" ? s.castling.K : s.castling.k) && !b[home+1] && !b[home+2] && b[home+3] === (turn === "w" ? "R" : "r")
                    && !attacked(b, home + 1, enemy) && !attacked(b, home + 2, enemy)) push(sq, home + 2, { castle: "K" });
                if ((turn === "w" ? s.castling.Q : s.castling.q) && !b[home-1] && !b[home-2] && !b[home-3] && b[home-4] === (turn === "w" ? "R" : "r")
                    && !attacked(b, home - 1, enemy) && !attacked(b, home - 2, enemy)) push(sq, home - 2, { castle: "Q" });
              }
            }
          } else {
            var sdirs = t === "r" ? [[1,0],[-1,0],[0,1],[0,-1]]
                      : t === "b" ? [[1,1],[1,-1],[-1,1],[-1,-1]]
                      : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
            for (var j = 0; j < sdirs.length; j++) {
              var cf2 = f, cr2 = r;
              while (true) {
                cf2 += sdirs[j][0]; cr2 += sdirs[j][1];
                if (cf2 < 0 || cf2 > 7 || cr2 < 0 || cr2 > 7) break;
                var tp3 = b[cr2 * 8 + cf2];
                if (!tp3) { if (!capturesOnly) push(sq, cr2 * 8 + cf2); }
                else { if (colorOf(tp3) !== turn) push(sq, cr2 * 8 + cf2); break; }
              }
            }
          }
        }
        return moves;
      }
      function makeMove(s, m) {
        var ns = cloneState(s), b = ns.board;
        b[m.from] = null;
        if (m.ep) b[m.to + (s.turn === "w" ? 8 : -8)] = null;
        b[m.to] = m.promo ? (s.turn === "w" ? m.promo.toUpperCase() : m.promo) : m.piece;
        if (m.castle === "K") { var h = s.turn === "w" ? 60 : 4; b[h + 1] = b[h + 3]; b[h + 3] = null; }
        if (m.castle === "Q") { var h2 = s.turn === "w" ? 60 : 4; b[h2 - 1] = b[h2 - 4]; b[h2 - 4] = null; }
        if (m.piece === "K") { ns.castling.K = false; ns.castling.Q = false; }
        if (m.piece === "k") { ns.castling.k = false; ns.castling.q = false; }
        if (m.from === 63 || m.to === 63) ns.castling.K = false;
        if (m.from === 56 || m.to === 56) ns.castling.Q = false;
        if (m.from === 7 || m.to === 7) ns.castling.k = false;
        if (m.from === 0 || m.to === 0) ns.castling.q = false;
        ns.ep = m.dbl ? (m.from + m.to) / 2 : -1;
        ns.half = (m.piece.toLowerCase() === "p" || m.captured) ? 0 : s.half + 1;
        if (s.turn === "b") ns.full = s.full + 1;
        ns.turn = opp(s.turn);
        return ns;
      }
      function legalMoves(s, capturesOnly) {
        var all = pseudoMoves(s, !!capturesOnly), out = [];
        for (var i = 0; i < all.length; i++) {
          var ns = makeMove(s, all[i]);
          if (!inCheck(ns, s.turn)) out.push(all[i]);
        }
        return out;
      }
      function moveScore(m) {
        var sc = 0;
        if (m.captured) sc = 10 * VAL[m.captured.toLowerCase()] - VAL[m.piece.toLowerCase()] / 10;
        if (m.promo) sc += VAL[m.promo];
        return sc;
      }
      function evaluate(s) {
        var score = 0;
        for (var i = 0; i < 64; i++) {
          var p = s.board[i];
          if (!p) continue;
          var t = p.toLowerCase();
          var pstIdx = isWhite(p) ? i : (7 - rankOf(i)) * 8 + fileOf(i);
          var v = VAL[t] + PST[t][pstIdx];
          score += isWhite(p) ? v : -v;
        }
        return score; // from White perspective, centipawns
      }
      function quiesce(s, alpha, beta, ply) {
        var stand = (s.turn === "w" ? 1 : -1) * evaluate(s);
        if (ply > 6) return stand;
        if (stand >= beta) return beta;
        if (stand > alpha) alpha = stand;
        var caps = legalMoves(s, true);
        caps.sort(function(a, b2) { return moveScore(b2) - moveScore(a); });
        for (var i = 0; i < caps.length; i++) {
          var sc = -quiesce(makeMove(s, caps[i]), -beta, -alpha, ply + 1);
          if (sc >= beta) return beta;
          if (sc > alpha) alpha = sc;
        }
        return alpha;
      }
      function negamax(s, depth, alpha, beta, ply) {
        if (s.half >= 100) return 0;
        if (depth === 0) return quiesce(s, alpha, beta, 0);
        var moves = legalMoves(s);
        if (moves.length === 0) {
          if (inCheck(s, s.turn)) return -100000 + ply; // checkmated
          return 0; // stalemate
        }
        moves.sort(function(a, b2) { return moveScore(b2) - moveScore(a); });
        var best = -Infinity;
        for (var i = 0; i < moves.length; i++) {
          var sc = -negamax(makeMove(s, moves[i]), depth - 1, -beta, -alpha, ply + 1);
          if (sc > best) best = sc;
          if (sc > alpha) alpha = sc;
          if (alpha >= beta) break;
        }
        return best;
      }
      function findBestMove(s, depth) {
        var moves = legalMoves(s);
        if (moves.length === 0) return null;
        moves.sort(function(a, b2) { return moveScore(b2) - moveScore(a); });
        var alpha = -Infinity, beta = Infinity, bestScore = -Infinity, scored = [];
        for (var i = 0; i < moves.length; i++) {
          var sc = -negamax(makeMove(s, moves[i]), depth - 1, -beta, -alpha, 1);
          scored.push({ m: moves[i], sc: sc });
          if (sc > bestScore) bestScore = sc;
          if (sc > alpha) alpha = sc;
        }
        // Variety: among moves close to the best, pick randomly so games differ.
        var slack = depth === 1 ? 60 : depth === 2 ? 25 : 8;
        var pool = scored.filter(function(x) { return x.sc >= bestScore - slack; });
        return pool[(Math.random() * pool.length) | 0].m;
      }
      function toSAN(s, m, legal) {
        var san;
        if (m.castle === "K") san = "O-O";
        else if (m.castle === "Q") san = "O-O-O";
        else if (m.piece.toLowerCase() === "p") {
          san = "";
          if (m.captured) san += "abcdefgh"[fileOf(m.from)] + "x";
          san += sqName(m.to);
          if (m.promo) san += "=" + m.promo.toUpperCase();
        } else {
          san = m.piece.toUpperCase();
          var others = legal.filter(function(x) { return x.piece === m.piece && x.to === m.to && x.from !== m.from; });
          if (others.length) {
            var sameFile = others.some(function(x) { return fileOf(x.from) === fileOf(m.from); });
            var sameRank = others.some(function(x) { return rankOf(x.from) === rankOf(m.from); });
            if (!sameFile) san += "abcdefgh"[fileOf(m.from)];
            else if (!sameRank) san += (8 - rankOf(m.from));
            else san += sqName(m.from);
          }
          if (m.captured) san += "x";
          san += sqName(m.to);
        }
        var ns = makeMove(s, m);
        if (inCheck(ns, ns.turn)) san += legalMoves(ns).length === 0 ? "#" : "+";
        return san;
      }
      function insufficientMaterial(b) {
        var rest = [];
        for (var i = 0; i < 64; i++) {
          var p = b[i];
          if (!p || p.toLowerCase() === "k") continue;
          rest.push(p.toLowerCase());
        }
        if (rest.length === 0) return true;
        if (rest.length === 1 && (rest[0] === "b" || rest[0] === "n")) return true;
        if (rest.length === 2 && rest[0] === "b" && rest[1] === "b") {
          var bishops = [];
          for (var j = 0; j < 64; j++) if (b[j] && b[j].toLowerCase() === "b") bishops.push((fileOf(j) + rankOf(j)) % 2);
          if (bishops[0] === bishops[1]) return true;
        }
        return false;
      }

      /* ================= Game controller ================= */
      var boardEl = document.getElementById("board");
      var statusText = document.getElementById("statusText");
      var statusSub = document.getElementById("statusSub");
      var turnDot = document.getElementById("turnDot");
      var thinkingEl = document.getElementById("thinking");
      var movesEl = document.getElementById("moves");
      var btnPlay = document.getElementById("btnPlay");
      var btnStep = document.getElementById("btnStep");
      var btnNew = document.getElementById("btnNew");
      var btnFlip = document.getElementById("btnFlip");
      var speedEl = document.getElementById("speed");
      var speedOut = document.getElementById("speedOut");
      var levelEl = document.getElementById("level");
      var resultBanner = document.getElementById("resultBanner");

      var state, historySAN, historyKeys, lastMove, gameOver, resultText;
      var playing = false, flipped = false, timer = null, thinking = false, runToken = 0;

      function speedMs() {
        var v = parseInt(speedEl.value, 10); // 0..100
        return Math.round(3200 - v * 30); // 3200ms .. 200ms
      }
      function speedLabel() {
        var ms = speedMs();
        if (ms >= 1000) return "1 nước / " + (ms / 1000).toFixed(1).replace(".", ",") + " giây";
        return "1 nước / " + ms + " ms";
      }
      function resetGame() {
        runToken++;
        stopTimer();
        playing = false; thinking = false; gameOver = false; resultText = "";
        state = initialState();
        historySAN = []; historyKeys = [posKey(state)]; lastMove = null;
        updatePlayBtn();
        render();
      }
      function stopTimer() { if (timer) { clearTimeout(timer); timer = null; } }
      function updatePlayBtn() {
        btnPlay.textContent = playing ? "⏸ Tạm dừng" : (historySAN.length ? "▶ Chơi tiếp" : "▶ Bắt đầu");
        btnStep.disabled = playing || thinking || gameOver;
      }
      function gameStatus() {
        var moves = legalMoves(state);
        var check = inCheck(state, state.turn);
        if (moves.length === 0) {
          if (check) return { over: true, text: state.turn === "w" ? "Chiếu hết! Máy Đen thắng 🏆" : "Chiếu hết! Máy Trắng thắng 🏆", sub: "Ván cờ kết thúc sau " + historySAN.length + " nước đi." };
          return { over: true, text: "Hòa — hết nước đi (pat)", sub: "Bên tới lượt không còn nước đi hợp lệ mà không bị chiếu." };
        }
        if (state.half >= 100) return { over: true, text: "Hòa — luật 50 nước", sub: "50 nước liên tiếp không ăn quân và không đi tốt." };
        if (insufficientMaterial(state.board)) return { over: true, text: "Hòa — không đủ quân chiếu hết", sub: "Thế cờ không thể dẫn tới chiếu hết." };
        var key = posKey(state), count = 0;
        for (var i = 0; i < historyKeys.length; i++) if (historyKeys[i] === key) count++;
        if (count >= 3) return { over: true, text: "Hòa — lặp lại thế cờ 3 lần", sub: "Cùng một thế cờ xuất hiện 3 lần trong ván." };
        return { over: false, check: check };
      }
      function scheduleNext() {
        stopTimer();
        if (!playing || gameOver) return;
        var token = runToken;
        timer = setTimeout(function() { if (token === runToken) doEngineMove(); }, Math.max(60, speedMs() - 250));
      }
      function doEngineMove() {
        if (gameOver || thinking) return;
        thinking = true;
        thinkingEl.classList.add("on");
        updatePlayBtn();
        var token = runToken;
        setTimeout(function() {
          if (token !== runToken) return;
          var depth = parseInt(levelEl.value, 10);
          var legal = legalMoves(state);
          var mv = findBestMove(state, depth);
          thinking = false;
          thinkingEl.classList.remove("on");
          if (!mv) { render(); return; }
          var san = toSAN(state, mv, legal);
          state = makeMove(state, mv);
          historySAN.push(san);
          historyKeys.push(posKey(state));
          lastMove = mv;
          var st = gameStatus();
          if (st.over) { gameOver = true; resultText = st.text; playing = false; }
          updatePlayBtn();
          render(st);
          if (playing && !gameOver) scheduleNext();
        }, 30);
      }
      function render(st) {
        if (!st) st = gameStatus();
        // Board
        boardEl.innerHTML = "";
        var order = [];
        for (var i = 0; i < 64; i++) order.push(i);
        if (flipped) order.reverse();
        var checkSq = st.check || (st.over && inCheck(state, state.turn)) ? kingSq(state.board, state.turn) : -1;
        order.forEach(function(sq) {
          var d = document.createElement("div");
          d.className = "sq " + (((fileOf(sq) + rankOf(sq)) % 2 === 0) ? "light" : "dark");
          if (lastMove && (sq === lastMove.from || sq === lastMove.to)) d.classList.add("last");
          if (sq === checkSq) d.classList.add("check");
          var p = state.board[sq];
          if (p) {
            var sp = document.createElement("span");
            sp.className = "piece " + (isWhite(p) ? "w" : "b");
            sp.textContent = GLYPH[p];
            d.appendChild(sp);
          }
          var showFile = flipped ? rankOf(sq) === 0 : rankOf(sq) === 7;
          var showRank = flipped ? fileOf(sq) === 7 : fileOf(sq) === 0;
          if (showFile) {
            var c1 = document.createElement("span");
            c1.className = "coord file"; c1.textContent = "abcdefgh"[fileOf(sq)];
            d.appendChild(c1);
          }
          if (showRank) {
            var c2 = document.createElement("span");
            c2.className = "coord rank"; c2.textContent = (8 - rankOf(sq));
            d.appendChild(c2);
          }
          boardEl.appendChild(d);
        });
        // Players / captured
        var startCount = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
        var nowCount = { w: { P: 0, N: 0, B: 0, R: 0, Q: 0 }, b: { P: 0, N: 0, B: 0, R: 0, Q: 0 } };
        var matW = 0, matB = 0;
        state.board.forEach(function(p) {
          if (!p || p.toLowerCase() === "k") return;
          var c = colorOf(p);
          nowCount[c][p.toUpperCase()]++;
          if (c === "w") matW += VAL[p.toLowerCase()]; else matB += VAL[p.toLowerCase()];
        });
        function capturedHTML(byColor) {
          // pieces captured BY byColor = opponent's missing pieces
          var victim = opp(byColor), html = "", orderPieces = ["Q","R","B","N","P"];
          orderPieces.forEach(function(t) {
            var missing = startCount[t] - nowCount[victim][t];
            for (var i = 0; i < missing; i++) html += '<span class="' + (victim === "w" ? "cap-w" : "cap-b") + '">' + GLYPH[victim === "w" ? t : t.toLowerCase()] + "</span>";
          });
          return html;
        }
        var topColor = flipped ? "w" : "b", bottomColor = flipped ? "b" : "w";
        function fillRow(color, nameEl, capEl, badgeEl) {
          nameEl.innerHTML = (color === "w" ? "Máy Trắng" : "Máy Đen") + '<span class="elo">tự động</span>';
          badgeEl.textContent = color === "w" ? "♙" : "♟";
          var diff = (color === "w" ? matW - matB : matB - matW) / 100;
          capEl.innerHTML = capturedHTML(color) + (diff > 0 ? '<span class="mat-diff">+' + diff + "</span>" : "");
        }
        fillRow(topColor, document.getElementById("topName"), document.getElementById("topCaptured"), document.getElementById("topBadge"));
        fillRow(bottomColor, document.getElementById("bottomName"), document.getElementById("bottomCaptured"), document.getElementById("bottomBadge"));
        // Status
        turnDot.className = "turn-dot" + (state.turn === "b" ? " black" : "");
        if (st.over) {
          statusText.textContent = st.text;
          statusSub.textContent = st.sub;
          resultBanner.textContent = st.text + " — bấm “Ván mới” để xem hai máy đánh ván khác.";
          resultBanner.classList.add("on");
        } else {
          resultBanner.classList.remove("on");
          statusText.textContent = state.turn === "w" ? "Lượt Máy Trắng" : "Lượt Máy Đen";
          statusSub.textContent = st.check ? "Chiếu! Bên bị chiếu phải thoát chiếu ở nước này."
            : (playing ? "Hai máy đang tự đánh…" : (historySAN.length ? "Đang tạm dừng." : "Bấm “Bắt đầu” để hai máy thi đấu."));
        }
        // Eval bar + stats
        var ev = evaluate(state);
        var pct = 50 + 50 * (2 / (1 + Math.exp(-ev / 350)) - 1);
        document.getElementById("evalWhite").style.height = Math.max(2, Math.min(98, pct)) + "%";
        document.getElementById("statMoves").textContent = historySAN.length;
        var caps = 0;
        ["w","b"].forEach(function(c) { ["P","N","B","R","Q"].forEach(function(t) { caps += startCount[t] - nowCount[c][t]; }); });
        document.getElementById("statCaps").textContent = caps;
        var evEl = document.getElementById("statEval");
        evEl.textContent = (ev > 0 ? "+" : "") + (ev / 100).toFixed(1);
        // Move list
        if (!historySAN.length) {
          movesEl.innerHTML = '<span class="empty">Chưa có nước đi nào.</span>';
        } else {
          var html = "<table>";
          for (var i2 = 0; i2 < historySAN.length; i2 += 2) {
            var isLastRow = i2 + 2 >= historySAN.length;
            html += '<tr class="' + (isLastRow ? "current" : "") + '"><td class="num">' + (i2 / 2 + 1) + '.</td><td class="mv played">' + historySAN[i2] + "</td><td class=\"mv" + (historySAN[i2 + 1] ? " played" : "") + '">' + (historySAN[i2 + 1] || "") + "</td></tr>";
          }
          html += "</table>";
          movesEl.innerHTML = html;
          movesEl.scrollTop = movesEl.scrollHeight;
        }
      }

      btnPlay.addEventListener("click", function() {
        if (gameOver) { resetGame(); }
        playing = !playing;
        updatePlayBtn();
        render();
        if (playing) scheduleNext();
        else stopTimer();
      });
      btnStep.addEventListener("click", function() {
        if (playing || thinking || gameOver) return;
        doEngineMove();
      });
      btnNew.addEventListener("click", function() {
        var wasPlaying = playing;
        resetGame();
        if (wasPlaying) { playing = true; updatePlayBtn(); render(); scheduleNext(); }
      });
      btnFlip.addEventListener("click", function() { flipped = !flipped; render(); });
      speedEl.addEventListener("input", function() {
        speedOut.textContent = speedLabel();
        if (playing) scheduleNext();
      });

      speedOut.textContent = speedLabel();
      resetGame();
