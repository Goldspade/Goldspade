class Game {
    constructor(){
        this.ctx = document.getElementById("c").getContext("2d");
        this.keys = {}; 
        this.run = 0; 
        this.frame = 0;
        this.animationId = null;
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        
        window.addEventListener("keydown",e=>{
            if(!this.run) return;
            this.keys[e.key.toLowerCase()] = 1;
            if(e.key === " ") e.preventDefault();
        });
        
        window.addEventListener("keyup",e=>{
            this.keys[e.key.toLowerCase()] = 0;
        });

        window.addEventListener("blur", () => {
            this.keys = {};
        });
    }

   map(){
    this.m = Array(GRID).fill().map((_,y)=>
        Array(GRID).fill().map((_,x)=>{
            if(x===0||y===0||x===GRID-1||y===GRID-1) return TYPE.WALL;
            if(x%2===0&&y%2===0) return TYPE.WALL;
            return TYPE.EMPTY;
        })
    );
    
    // 定义安全区域：出生点及其曼哈顿距离为1的位置
    const safeZones = [
        {x: 1, y: 1},              // 玩家出生点
        {x: 1, y: GRID-2},         // AI1出生点
        {x: GRID-2, y: 1},         // AI2出生点
        {x: GRID-2, y: GRID-2}    // AI3出生点
    ];
    
    // 检查位置是否在安全区域内
    const isInSafeZone = (x, y) => {
        return safeZones.some(zone => 
            Math.abs(x - zone.x) + Math.abs(y - zone.y) <= 1
        );
    };
    
    for(let y=1;y<GRID-1;y++){
        for(let x=1;x<GRID-1;x++){
            // 如果不在安全区域且是边缘位置，放置砖块
            if(!isInSafeZone(x, y) && 
               (y===1 || x===1 || y===GRID-2 || x===GRID-2) &&
               this.m[y][x]===TYPE.EMPTY) {
                this.m[y][x] = TYPE.BRICK;
            }
            // 非边缘区域按概率放置砖块
            else if(!isInSafeZone(x, y) && 
                    !(y===1 || x===1 || y===GRID-2 || x===GRID-2) &&
                    this.m[y][x]===TYPE.EMPTY && 
                    Math.random()<CFG.BRICK_RATE) {
                this.m[y][x] = TYPE.BRICK;
            }
        }
    }
}



    start(){
        if(this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        document.getElementById("start").classList.add("hide");
        document.getElementById("over").classList.add("hide");
        
        this.run = 1; 
        this.frame = 0; 
        this.lastFrameTime = performance.now();
        this.map();
        
        // 修改出生点位置
        this.p = new Role(1,1);
        this.ai = [
            new Role(1,GRID-2,true),
            new Role(GRID-2,1,true),
            new Role(GRID-2,GRID-2,true)
        ];
        
        this.bombs = []; 
        this.ex = []; 
        this.items = [];
        
        this.ui(); 
        this.loop();
    }


    putBomb(r){
        if(r.dead || r.rebornCd > 0) return;
        if(r.bombUsed >= r.bombMax || r.bombCd > 0) return;
        
        let hasBomb = false;
        for(let i=0; i<this.bombs.length; i++) {
            const b = this.bombs[i];
            if(b.gx===r.gx&&b.gy===r.gy&&b.timer>0) {
                hasBomb = true;
                break;
            }
        }
        if(hasBomb) return;
        
        if(this.bombs.length >= CFG.MAX_BOMBS) return;
        
        this.bombs.push(new Bomb(r.gx, r.gy, r));
        r.bombUsed++; 
        r.bombCd = CFG.BOMB_COOLDOWN; 
        r.inv = CFG.INVINCIBLE;
    }

    explode(b){
        b.owner.bombUsed = Math.max(0, b.owner.bombUsed-1);
        const range = b.getRange(this.m);
        
        range.forEach(p=>{
            if(p.gx<1||p.gy<1||p.gx>=GRID-1||p.gy>=GRID-1) return;
            
            if(this.ex.length < CFG.MAX_EXPLOSIONS) {
                this.ex.push(new Explode(p.gx,p.gy));
            }
            
            if(this.m[p.gy][p.gx]===TYPE.BRICK){
                this.m[p.gy][p.gx] = TYPE.EMPTY;
                if(Math.random()<CFG.ITEM_RATE && this.items.length < CFG.MAX_ITEMS){
                    this.items.push(new Item(p.gx,p.gy,~~(Math.random()*4)+1));
                }
            }
            
            let cb = null;
            for(let i=0; i<this.bombs.length; i++) {
                const x = this.bombs[i];
                if(x.gx===p.gx&&x.gy===p.gy&&x!==b&&x.timer>12) {
                    cb = x;
                    break;
                }
            }
            if(cb) cb.timer = 12;
        });
    }

    isDanger(gx,gy, isAI = false){
        for(let i=0; i<this.ex.length; i++) {
            const e = this.ex[i];
            if(e.gx===gx&&e.gy===gy) return true;
        }
        for(let i=0; i<this.bombs.length; i++) {
            const b = this.bombs[i];
            if(b.timer <= 0 && b.isCovers(gx, gy, this.m)) {
                return true;
            }
        }
        return false;
    }

    getDistanceToNearestBomb(gx, gy) {
        let minDist = Infinity;
        for(let i=0; i<this.bombs.length; i++) {
            const b = this.bombs[i];
            if(b.timer < CFG.AI_DANGER_TIMER) {
                const dist = Math.hypot(gx - b.gx, gy - b.gy);
                minDist = Math.min(minDist, dist);
            }
        }
        return minDist === Infinity ? 0 : minDist;
    }

    bfs(sx,sy,tx,ty,role){
        const vis = Array(GRID).fill().map(()=>Array(GRID).fill(0));
        const q = [{x:sx,y:sy,path:[]}]; 
        vis[sy][sx] = 1;
        const allRoles = [this.p, ...this.ai];
        
        let iterCount = 0;
        let ptr = 0;
        
        while(ptr < q.length && q[ptr].path.length < CFG.AI_PATH_LEN && q.length < CFG.MAX_QUEUE_LEN && iterCount < CFG.MAX_BFS_ITER){
            iterCount++;
            const c = q[ptr++];
            
            if(c.x === tx && c.y === ty) return c.path;
            
            const dirs = [...DIR].sort((a,b)=>{
                const scoreA = (a[0] * (tx - c.x)) + (a[1] * (ty - c.y));
                const scoreB = (b[0] * (tx - c.x)) + (b[1] * (ty - c.y));
                return scoreB - scoreA;
            });
            
            for(let d of dirs){
                const nx = c.x + d[0];
                const ny = c.y + d[1];
                
                // 【关键】AI攻击时忽略危险检测（仅路径规划阶段），更敢接近玩家
                if(role.canMove(nx,ny,this.m,this.bombs,allRoles) && !vis[ny][nx] && 
                   (!role.isAI || !this.isDanger(nx,ny, true) || iterCount < 10)){
                    vis[ny][nx] = 1; 
                    q.push({x:nx,y:ny,path:[...c.path,d]});
                }
            }
        }
        
        return ptr < q.length ? q[ptr].path : null;
    }

    // 改进逃生BFS逻辑，考虑所有连通区域
escapeBfs(sx,sy,role){
    const vis = Array(GRID).fill().map(()=>Array(GRID).fill(0));
    const q = [{x:sx,y:sy,path:[], distance: this.getDistanceToNearestBomb(sx, sy)}]; 
    vis[sy][sx] = 1;
    const allRoles = [this.p, ...this.ai];
    
    let iterCount = 0;
    let ptr = 0;
    let bestEscapePath = null;
    let maxSafeDistance = 0;
    
    // 收集所有炸弹的危险区域
    const dangerZones = new Set();
    for(let i=0; i<this.bombs.length; i++) {
        const b = this.bombs[i];
        if(b.timer < CFG.AI_DANGER_TIMER) {
            const range = b.getRange(this.m);
            range.forEach(p => {
                dangerZones.add(`${p.gx},${p.gy}`);
            });
        }
    }
    
    while(ptr < q.length && q[ptr].path.length < CFG.AI_ESCAPE_LEN && q.length < CFG.MAX_QUEUE_LEN && iterCount < CFG.MAX_BFS_ITER){
        iterCount++;
        const c = q[ptr++];
        
        // 检查当前位置是否安全
        const isSafe = !dangerZones.has(`${c.x},${c.y}`);
        
        if(isSafe) {
            if(c.distance > maxSafeDistance) {
                maxSafeDistance = c.distance;
                bestEscapePath = c.path;
            }
            // 如果找到足够安全的路径，立即返回
            if(c.distance >= 3) {
                return c.path;
            }
        }
        
        const dirs = [...DIR].sort((a,b)=>{
            const nx1 = c.x + a[0];
            const ny1 = c.y + a[1];
            const dist1 = this.getDistanceToNearestBomb(nx1, ny1);
            
            const nx2 = c.x + b[0];
            const ny2 = c.y + b[1];
            const dist2 = this.getDistanceToNearestBomb(nx2, ny2);
            
            return dist2 - dist1;
        });
        
        for(let d of dirs){
            const nx = c.x + d[0];
            const ny = c.y + d[1];
            
            if(role.canMove(nx,ny,this.m,this.bombs,allRoles) && !vis[ny][nx]){
                vis[ny][nx] = 1; 
                const newDist = this.getDistanceToNearestBomb(nx, ny);
                q.push({x:nx,y:ny,path:[...c.path,d], distance: newDist});
            }
        }
    }
    
    // 如果没有找到理想的安全路径，返回找到的最佳路径
    if(bestEscapePath) {
        return bestEscapePath;
    }
    
    // 最后尝试：向任意安全方向移动一步
    for(let d of DIR){
        const nx = sx + d[0];
        const ny = sy + d[1];
        if(role.canMove(nx,ny,this.m,this.bombs,allRoles) && !dangerZones.has(`${nx},${ny}`)){
            return [d];
        }
    }
    return null;
}


    predictTargetPos(target) {
        let gx = target.gx;
        let gy = target.gy;
        
        // 【关键】优化预判逻辑，考虑玩家可能的变向
        const possibleDirs = [target.lastDir, [target.lastDir[1], target.lastDir[0]], 
                             [-target.lastDir[1], -target.lastDir[0]]];
        
        // 尝试多种预判方向，选择最优拦截点
        let bestPredict = {gx, gy, score: 0};
        
        for(let dir of possibleDirs) {
            let currGx = gx;
            let currGy = gy;
            let validSteps = 0;
            
            for(let i=0; i<CFG.AI_PREDICT_STEPS; i++) {
                const nx = currGx + dir[0];
                const ny = currGy + dir[1];
                
                if(nx>1 && nx<GRID-2 && ny>1 && ny<GRID-2 && this.m[ny][nx]===TYPE.EMPTY) {
                    currGx = nx;
                    currGy = ny;
                    validSteps++;
                } else {
                    break;
                }
            }
            
            const score = validSteps * 2 - Math.abs(currGx - gx) - Math.abs(currGy - gy);
            if(score > bestPredict.score) {
                bestPredict = {gx: currGx, gy: currGy, score};
            }
        }
        
        return {gx: bestPredict.gx, gy: bestPredict.gy};
    }

    // 【关键】重写攻击位置查找逻辑，更精准拦截玩家
    findBestAttackPos(ai, target) {
        const allRoles = [this.p, ...this.ai];
        const predictPos = this.predictTargetPos(target);
        const attackCandidates = [];

        // 1. 优先在玩家移动路径上布置炸弹（拦截）
        for(let i=1; i<=ai.pow; i++) {
            // 沿玩家移动方向前i格
            const gx = predictPos.gx - target.lastDir[0] * i;
            const gy = predictPos.gy - target.lastDir[1] * i;
            
            if(ai.canMove(gx, gy, this.m, this.bombs, allRoles) && !this.isDanger(gx, gy, true)) {
                const distToTarget = Math.hypot(gx - predictPos.gx, gy - predictPos.gy);
                attackCandidates.push({gx, gy, dist: distToTarget, type: "intercept"});
            }
        }

        // 2. 补充直接攻击位置
        for(let dx=-2; dx<=2; dx++) {
            for(let dy=-2; dy<=2; dy++) {
                const gx = ai.gx + dx;
                const gy = ai.gy + dy;
                
                if(ai.canMove(gx, gy, this.m, this.bombs, allRoles) && !this.isDanger(gx, gy, true)) {
                    const distToTarget = Math.hypot(gx - predictPos.gx, gy - predictPos.gy);
                    if(distToTarget <= ai.pow) { // 【关键】炸弹必中范围
                        attackCandidates.push({gx, gy, dist: distToTarget, type: "direct"});
                    }
                }
            }
        }

        if(attackCandidates.length) {
            // 优先拦截位置，其次近距离
            return attackCandidates.sort((a,b) => {
                if(a.type === "intercept" && b.type !== "intercept") return -1;
                if(a.type !== "intercept" && b.type === "intercept") return 1;
                return a.dist - b.dist;
            })[0];
        }
        return null;
    }
    
    // 改进开路逻辑，增加安全性判断
checkBreakWall(ai){
    const allRoles = [this.p, ...this.ai];
    if(ai.bombCd > 0 || ai.bombUsed >= ai.bombMax) return false;
    if(this.isDanger(ai.gx, ai.gy, true)) return false;
    
    for(let dx=-1; dx<=1; dx++){
        for(let dy=-1; dy<=1; dy++){
            const nx = ai.gx + dx;
            const ny = ai.gy + dy;
            if(this.m[ny][nx] === TYPE.BRICK){
                // 使用改进的安全性判断
                if(this.canSafelyEscape(ai)){
                    if(Math.random() < CFG.AI_BREAK_WALL_CHANCE){
                        this.putBomb(ai);
                        return true;
                    }
                }
            }
        }
    }
    return false;
}



// 检查AI放炸弹后是否有安全逃生路径
canSafelyEscape(ai) {
    const gx = ai.gx;
    const gy = ai.gy;
    const allRoles = [this.p, ...this.ai];
    
    // 创建测试炸弹，检查爆炸范围
    const testBomb = new Bomb(gx, gy, ai);
    const bombRange = testBomb.getRange(this.m);
    
    // 找出爆炸范围内的所有位置
    const dangerPositions = new Set();
    bombRange.forEach(p => {
        dangerPositions.add(`${p.gx},${p.gy}`);
    });
    
    // 使用BFS找出所有可达的安全位置
    const vis = Array(GRID).fill().map(() => Array(GRID).fill(0));
    const q = [{x: gx, y: gy}];
    vis[gy][gx] = 1;
    
    let safeCount = 0;
    let ptr = 0;
    
    while(ptr < q.length && ptr < 200) {
        const c = q[ptr++];
        
        // 如果当前位置不在爆炸范围内，算作安全位置
        if(!dangerPositions.has(`${c.x},${c.y}`)) {
            safeCount++;
            // 【关键】降低安全性要求，只要有1个安全位置就认为可以放炸弹
            if(safeCount >= 1) return true;
        }
        
        // 探索相邻位置
        for(let d of DIR) {
            const nx = c.x + d[0];
            const ny = c.y + d[1];
            
            // 检查是否可以移动到该位置
            if(ai.canMove(nx, ny, this.m, this.bombs, allRoles) && !vis[ny][nx]) {
                // 检查该位置是否在爆炸范围内
                const inDanger = dangerPositions.has(`${nx},${ny}`);
                
                // 【关键】允许AI在爆炸边缘逃生，即使炸弹时间较短
                if(!inDanger || testBomb.timer > 30) {
                    vis[ny][nx] = 1;
                    q.push({x: nx, y: ny});
                }
            }
        }
    }
    
    // 【关键】降低安全性要求，只要有1个安全位置就认为可以放炸弹
    return safeCount >= 1;
}

// 寻找并破坏墙壁的方法
findAndBreakWall(ai) {
    const gx = ai.gx;
    const gy = ai.gy;
    const allRoles = [this.p, ...this.ai];
    
    // 如果不能放炸弹，返回false
    if(ai.bombCd > 0 || ai.bombUsed >= ai.bombMax) return false;
    if(this.isDanger(gx, gy, true)) return false;
    
    // 使用BFS寻找最近的砖块
    const vis = Array(GRID).fill().map(() => Array(GRID).fill(0));
    const q = [{x: gx, y: gy, path: []}];
    vis[gy][gx] = 1;
    
    let ptr = 0;
    let bestBrickPos = null;
    let bestPath = null;
    
    // 【关键】增加搜索范围，从8格增加到12格
    const maxSearchDist = 12;
    
    while(ptr < q.length && ptr < 300) {
        const c = q[ptr++];
        
        // 检查当前位置周围是否有砖块
        for(let d of DIR) {
            const nx = c.x + d[0];
            const ny = c.y + d[1];
            
            // 检查是否是砖块
            if(nx > 0 && nx < GRID-1 && ny > 0 && ny < GRID-1 && 
               this.m[ny][nx] === TYPE.BRICK) {
                // 检查AI是否可以移动到当前位置
                if(ai.canMove(c.x, c.y, this.m, this.bombs, allRoles)) {
                    // 检查在当前位置放炸弹是否安全
                    const testBomb = new Bomb(c.x, c.y, ai);
                    const bombRange = testBomb.getRange(this.m);
                    const canEscape = this.canSafelyEscapeFromBomb(ai, c.x, c.y, bombRange);
                    
                    // 【关键】降低安全性要求，只要有逃生可能就放炸弹
                    if(canEscape) {
                        // 找到可以安全破坏的砖块
                        bestBrickPos = {x: nx, y: ny};
                        bestPath = c.path;
                        // 立即返回，不再继续搜索
                        return this.executeBreakWall(ai, bestBrickPos, bestPath);
                    }
                }
            }
        }
        
        // 如果路径太长，不再继续搜索
        if(c.path.length >= maxSearchDist) continue;
        
        // 继续搜索相邻位置
        for(let d of DIR) {
            const nx = c.x + d[0];
            const ny = c.y + d[1];
            
            // 检查是否可以移动到该位置
            if(ai.canMove(nx, ny, this.m, this.bombs, allRoles) && !vis[ny][nx]) {
                vis[ny][nx] = 1;
                q.push({x: nx, y: ny, path: [...c.path, d]});
            }
        }
    }
    
    return false;
}


// 执行破坏墙壁的操作
executeBreakWall(ai, brickPos, path) {
    const gx = ai.gx;
    const gy = ai.gy;
    const allRoles = [this.p, ...this.ai];
    
    // 如果有路径，先移动到目标位置
    if(path && path.length > 0) {
        ai.move(gx + path[0][0], gy + path[0][1]);
        return true;
    }
    
    // 【关键】增加放炸弹的概率，从0.3提高到0.8
    if(Math.random() < 0.8) {
        this.putBomb(ai);
        // 放弹后立即移动一步
        const dirs = [...DIR].sort(()=>Math.random()-.5);
        for(let d of dirs) {
            const nx = gx + d[0]; 
            const ny = gy + d[1];
            if(ai.canMove(nx,ny,this.m,this.bombs,allRoles) && !this.isDanger(nx,ny, true)){
                ai.move(nx,ny);
                return true;
            }
        }
        return true;
    }
    
    return false;
}


// 检查AI从指定位置放炸弹后是否能安全逃生
canSafelyEscapeFromBomb(ai, bombX, bombY, bombRange) {
    const allRoles = [this.p, ...this.ai];
    
    // 找出爆炸范围内的所有位置
    const dangerPositions = new Set();
    bombRange.forEach(p => {
        dangerPositions.add(`${p.gx},${p.gy}`);
    });
    
    // 使用BFS找出所有可达的安全位置
    const vis = Array(GRID).fill().map(() => Array(GRID).fill(0));
    const q = [{x: bombX, y: bombY}];
    vis[bombY][bombX] = 1;
    
    let safeCount = 0;
    let ptr = 0;
    
    while(ptr < q.length && ptr < 200) {
        const c = q[ptr++];
        
        // 如果当前位置不在爆炸范围内，算作安全位置
        if(!dangerPositions.has(`${c.x},${c.y}`)) {
            safeCount++;
            // 【关键】降低安全性要求，只要有1个安全位置就认为可以放炸弹
            if(safeCount >= 1) return true;
        }
        
        // 探索相邻位置
        for(let d of DIR) {
            const nx = c.x + d[0];
            const ny = c.y + d[1];
            
            // 检查是否可以移动到该位置
            if(ai.canMove(nx, ny, this.m, this.bombs, allRoles) && !vis[ny][nx]) {
                // 检查该位置是否在爆炸范围内
                const inDanger = dangerPositions.has(`${nx},${ny}`);
                
                // 【关键】允许AI在爆炸边缘逃生，即使炸弹时间较短
                if(!inDanger) {
                    vis[ny][nx] = 1;
                    q.push({x: nx, y: ny});
                }
            }
        }
    }
    
    // 【关键】降低安全性要求，只要有1个安全位置就认为可以放炸弹
    return safeCount >= 1;
}


    // 【核心】重写AI行为逻辑，调整优先级并改进安全性判断
// 【核心】重写AI行为逻辑，增加主动开路逻辑
doAI(ai){
    if(ai.dead) return;
    ai.update();
    
    const gx = ai.gx; 
    const gy = ai.gy;
    const allRoles = [this.p, ...this.ai];

    // 最高优先级：躲炸弹（改进连通性检查）
    if(this.isDanger(gx,gy, true)){
        const escapePath = this.escapeBfs(gx,gy,ai);
        if(escapePath && escapePath.length){
            ai.move(gx + escapePath[0][0], gy + escapePath[0][1]);
            return;
        }
        
        // 如果没有找到逃生路径，尝试向任意安全方向移动
        const safeDirs = DIR.map(d=>{
            const nx = gx + d[0]; 
            const ny = gy + d[1];
            return {
                dir: d,
                safe: ai.canMove(nx,ny,this.m,this.bombs,allRoles) && !this.isDanger(nx,ny, true),
                dist: this.getDistanceToNearestBomb(nx, ny)
            };
        }).filter(item => item.safe).sort((a,b) => b.dist - a.dist);
        
        if(safeDirs.length) {
            ai.move(gx + safeDirs[0].dir[0], gy + safeDirs[0].dir[1]);
        }
        return;
    }

    // 第二优先级：攻击玩家
    const mainTarget = this.p; // 只攻击玩家，忽略其他AI
    if(!mainTarget.dead) {
        const dist = Math.hypot((mainTarget.gx - gx)*TILE, (mainTarget.gy - gy)*TILE);
        
        // 追击逻辑：超远距离追击
        if(dist < CFG.AI_CHASE_RANGE) {
            // 近距离直接放炸弹（改进安全性判断）
            if(dist < CFG.AI_ATTACK_RANGE && ai.bombCd === 0) {
                // 检查是否有安全的逃生路径
                const canEscape = this.canSafelyEscape(ai);
                
                // 如果有安全路径或距离非常近，放弹
                if(canEscape || dist < 40) {
                    this.putBomb(ai);
                    // 放弹后立即移动一步
                    const dirs = [...DIR].sort(()=>Math.random()-.5);
                    for(let d of dirs) {
                        const nx = gx + d[0]; 
                        const ny = gy + d[1];
                        if(ai.canMove(nx,ny,this.m,this.bombs,allRoles) && !this.isDanger(nx,ny, true)){
                            ai.move(nx,ny);
                            return;
                        }
                    }
                    return;
                }
            }
            
            // 找攻击位置并移动（优先拦截）
            const bestAttackPos = this.findBestAttackPos(ai, mainTarget);
            if(bestAttackPos) {
                const attackPath = this.bfs(gx, gy, bestAttackPos.gx, bestAttackPos.gy, ai);
                if(attackPath && attackPath.length){
                    ai.move(gx + attackPath[0][0], gy + attackPath[0][1]);
                    return;
                }
            } else if(dist > 80) {
                // 没有攻击位置时，直接向玩家移动
                const chasePath = this.bfs(gx, gy, mainTarget.gx, mainTarget.gy, ai);
                if(chasePath && chasePath.length) {
                    ai.move(gx + chasePath[0][0], gy + chasePath[0][1]);
                    return;
                }
            }
        }
    }

    // 第三优先级：捡道具
    const availItems = this.items.filter(i=>!this.isDanger(i.gx,i.gy, true) && 
                                              (i.t===ITEM.POW || i.t===ITEM.BOMB_CNT));
    if(availItems.length && Math.random() > 0.5){
        const targetItem = availItems.reduce((a,b)=>
            Math.hypot(a.gx-gx,a.gy-gy) < Math.hypot(b.gx-gx,b.gy-gy) ? a : b
        );
        
        const itemPath = this.bfs(gx,gy,targetItem.gx,targetItem.gy,ai);
        if(itemPath && itemPath.length){
            ai.move(gx + itemPath[0][0], gy + itemPath[0][1]);
            return;
        }
    }

    // 第四优先级：主动开路（新增逻辑）
    if(this.findAndBreakWall(ai)) return;

    // 最低优先级：随机移动（仅当无其他目标时）
    if(Math.random() < 0.2){
        const dirs = [...DIR].sort(()=>Math.random()-.5);
        for(let d of dirs) {
            const nx = gx + d[0]; 
            const ny = gy + d[1];
            if(ai.canMove(nx,ny,this.m,this.bombs,allRoles) && !this.isDanger(nx,ny, true)){
                ai.move(nx,ny);
                break;
            }
        }
    }
}



    update(timestamp){
        if(!this.run) return; 
        this.frame++;
        
        this.deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;
        
        this.p.update();
        const allRoles = [this.p, ...this.ai];

        let moveDir = null;
        if(this.p.moveCd <= 0) {
            if(this.keys.w||this.keys.arrowup) moveDir = [0,-1];
            else if(this.keys.s||this.keys.arrowdown) moveDir = [0,1];
            else if(this.keys.a||this.keys.arrowleft) moveDir = [-1,0];
            else if(this.keys.d||this.keys.arrowright) moveDir = [1,0];
        }
        
        if(moveDir) {
            const nx = this.p.gx + moveDir[0];
            const ny = this.p.gy + moveDir[1];
            if(this.p.canMove(nx, ny, this.m, this.bombs, allRoles)){
                this.p.move(nx, ny);
            }
        }
        
        if(this.keys[' ']) {
            this.putBomb(this.p);
            this.keys[' '] = 0;
        }

        let playerItemIndex = -1;
        for(let i=0; i<this.items.length; i++) {
            const item = this.items[i];
            if(item.gx===this.p.gx&&item.gy===this.p.gy) {
                playerItemIndex = i;
                break;
            }
        }
        if(playerItemIndex >= 0){ 
            this.p.pick(this.items[playerItemIndex].t); 
            this.items.splice(playerItemIndex, 1);
            this.ui(); 
        }

        // 【关键】AI每帧都执行，不再限制频率
        this.ai.forEach((ai, i) => {
            if(ai.dead) return;
            this.doAI(ai);
        });
        
        for(let i=0; i<this.ai.length; i++) {
            const a = this.ai[i];
            if(a.dead) continue;
            
            let aiItemIndex = -1;
            for(let j=0; j<this.items.length; j++) {
                const item = this.items[j];
                if(item.gx===a.gx&&item.gy===a.gy) {
                    aiItemIndex = j;
                    break;
                }
            }
            if(aiItemIndex >= 0){ 
                a.pick(this.items[aiItemIndex].t); 
                this.items.splice(aiItemIndex, 1);
                this.ui(); 
            }
        }

        this.bombs = this.bombs.filter(b=>{
            if(b.update()){ 
                this.explode(b); 
                return false; 
            } 
            return true;
        });
        this.ex = this.ex.filter(e=>!e.update());
        this.items = this.items.filter(i=>!i.update());

        if(!this.p.dead && this.p.rebornCd === 0 && this.isDanger(this.p.gx,this.p.gy)){
            const isDead = this.p.loseLife();
            this.ui();
            if(isDead) {
                this.end(0); 
                return;
            }
        }
        
        for(let i=0; i<this.ai.length; i++) {
            const a = this.ai[i];
            if(a.dead || a.rebornCd > 0) continue;
            if(this.isDanger(a.gx,a.gy, true)) {
                a.loseLife();
            }
        }
        
        this.ai = this.ai.filter(a=>!a.dead);
        document.getElementById("en").textContent = this.ai.length;

        if(this.ai.length === 0) {
            this.end(1);
        }
    }

    draw(){
        this.ctx.clearRect(0,0,340,340);
        
        for(let y=0;y<GRID;y++){
            for(let x=0;x<GRID;x++){
                const t = this.m[y][x];
                this.ctx.fillStyle = t===TYPE.WALL?"#333":t===TYPE.BRICK?"#888":"#eee";
                this.ctx.fillRect(x*TILE+1,y*TILE+1,TILE-2,TILE-2);
            }
        }
        
        this.ctx.fillStyle = "#ff5500";
        for(let i=0; i<this.ex.length; i++) {
            const e = this.ex[i];
            this.ctx.fillRect(e.gx*TILE+1,e.gy*TILE+1,TILE-2,TILE-2);
        }
        
        for(let i=0; i<this.items.length; i++) {
            const iItem = this.items[i];
            this.ctx.fillStyle = iItem.t===ITEM.POW?"#4d8df5":
                                iItem.t===ITEM.SPD?"#36c969":
                                iItem.t===ITEM.BTIME?"#ff9c41":"#a864e8";
            this.ctx.fillRect(iItem.gx*TILE+6,iItem.gy*TILE+6,TILE-12,TILE-12);
        }
        
        for(let i=0; i<this.bombs.length; i++) {
            const b = this.bombs[i];
            this.ctx.fillStyle = b.timer < 60 ? "#ff3333" : "#222";
            this.ctx.beginPath();
            this.ctx.arc(b.px,b.py,b.radius,0,Math.PI*2);
            this.ctx.fill();
        }
        
        for(let i=0; i<this.ai.length; i++) {
            const a = this.ai[i];
            if(!a.dead && a.inv % 4 < 2) {
                this.ctx.fillStyle = a.life <= 1 ? "#ff3333" : "#777";
                this.ctx.beginPath();
                this.ctx.arc(a.px,a.py,8,0,Math.PI*2);
                this.ctx.fill();
                this.ctx.fillStyle = "#fff";
                this.ctx.font = "8px monospace";
                this.ctx.fillText(a.life, a.px-3, a.py+3);
            }
        }
        
        if(!this.p.dead && this.p.inv % 4 < 2) {
            this.ctx.fillStyle = "#fff";
            this.ctx.fillRect(this.p.px-9,this.p.py-9,18,18);
            this.ctx.fillStyle = "#111";
            this.ctx.fillRect(this.p.px-7,this.p.py-7,14,14);
            this.ctx.fillStyle = "#fff";
            this.ctx.font = "10px monospace";
            this.ctx.fillText(this.p.life, this.p.px-4, this.p.py+4);
        }
    }

    loop(timestamp = 0){
        if(!this.run) return;
        
        const targetDelta = 1000 / CFG.TARGET_FPS;
        if(timestamp - this.lastFrameTime >= targetDelta) {
            this.update(timestamp);
            this.draw();
        }
        
        this.animationId = requestAnimationFrame((t)=>this.loop(t));
    }

    ui(){
        document.getElementById("life").textContent = this.p.life;
        document.getElementById("en").textContent = this.ai.length;
        document.getElementById("pw").textContent = this.p.pow;
        document.getElementById("sp").textContent = this.p.spd;
        const btRate = (CFG.BASE_BTIME / this.p.bTime).toFixed(1);
        document.getElementById("bt").textContent = `${btRate}x`;
        document.getElementById("bm").textContent = this.p.bombMax;
    }

    end(w){
        this.run = 0;
        if(this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        const msg = w ? `胜利！剩余生命：${this.p.life}` : `失败！`;
        document.getElementById("msg").textContent = msg;
        document.getElementById("over").classList.remove("hide");
    }
}

const game = new Game();