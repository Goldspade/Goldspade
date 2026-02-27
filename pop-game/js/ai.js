class AiRole extends Role {
    constructor(x, y) {
        super(x, y, true);
    }
    /* 每一帧检查 */
    isDanger(m, bombs, ex){
        const gx = this.gx;
        const gy = this.gy;
        for(let i=0; i<ex.length; i++) {
            const e = ex[i];
            if(e.gx===gx&&e.gy===gy) return true;
        }
        
        const dangerTimer = CFG.AI_DANGER_TIMER;
        for(let i=0; i<bombs.length; i++) {
            const b = bombs[i];
            if(b.timer < dangerTimer && b.isCovers(gx, gy, m)) {
                return true;
            }
        }
        return false;
    }
    escapeDfs(m, bombs, ex, allRoles) {
        const vis = Array(GRID).fill().map(() => Array(GRID).fill(0));
        const bj = Array(GRID).fill().map(() => Array(GRID).fill(0));
        const dfs = function (x, y, t=0) {
            if (vis[x][y]) return bj[x][y];
            vis[x][y] = 1;
            if (m[x][y] === TYPE.WALL || m[x][y] === TYPE.BRICK || allRoles.some(p=>p.gx === x && p.gy === y)) return bj[x][y]=false;
            if (m[x][y] === TYPE.EMPTY) {
                for (let i = 0; i < bombs.length; i++) {
                    if (bombs[i].timer<=t) {
                        const range = bombs[i].getRange(m);
                        for (let j = 0; j < range.length; j++)
                            if (range[j].gx === x && range[j].gy === y)
                                    return bj[x][y]=false;
                    } else if (bombs[i].gx === x && bombs[i].gy === y) return bj[x][y] = false;
                }
                for (let i = 0; i < ex.length; i++)
                    if (ex[i].life>=t && ex[i].gx === x && ex[i].gy === y) return bj[x][y]=false; 
                return bj[x][y]=true;
            }
            for (let i = 0; i < DIR.length; i++) {
                const nx = x + DIR[i][0];
                const ny = y + DIR[i][1];
                if (nx < GRID && ny < GRID && nx >= 0 && ny >= 0) bj[x][y] ||= dfs(nx, ny, t+CFG.MOVE-(this.spd-1)*1.5+2);
            }
            return bj[x][y];
        }
        return bj;
    }
    available(m, bombs, ex, allRoles) {
        const vis = Array(GRID).fill().map(()=>Array(GRID).fill(0));
        const safePoints = [];
        const q = [{x : this.gx, y : this.gy, t : 0}];
        var ptr = 0;
        
        while (ptr < q.length) {
            const x = q[ptr].x, y = q[ptr].y, t = q[ptr].t;
            ++ptr;
            
            if (vis[x][y]) continue;
            vis[x][y] = 1;
            
            // 检查当前位置是否安全
            let isSafe = true;
            
            // 检查炸弹威胁
            for(let i=0; i<bombs.length; i++) {
                if(bombs[i].timer<=t) {
                    const range = bombs[i].getRange(m);
                    for(let j=0; j<range.length; j++) {
                        if(range[j].gx === x && range[j].gy === y) {
                            isSafe = false;
                            break;
                        }
                    }
                } else if(bombs[i].gx === x && bombs[i].gy === y) {
                    isSafe = false;
                }
                if(!isSafe) break;
            }
            
            // 检查爆炸威胁
            if(isSafe) {
                for(let i=0; i<ex.length; i++) {
                    if(ex[i].life>=t && ex[i].gx === x && ex[i].gy === y) {
                        isSafe = false;
                        break;
                    }
                }
            }
            
            // 如果安全且不是起点，添加到结果中
            if(isSafe && (x !== this.gx || y !== this.gy)) {
                safePoints.push({x, y});
            }
            
            // 继续BFS
            DIR.forEach(d => {
                const nx = x+d[0];
                const ny = y+d[1];
                if(nx < GRID && ny < GRID && nx >= 0 && ny >= 0 && !vis[nx][ny]) {
                    // 检查是否可以移动到该位置
                    if(m[nx][ny] === TYPE.EMPTY && !allRoles.some(p=>p.gx === nx && p.gy === ny)) {
                        q.push({x: nx, y: ny, t: t+CFG.MOVE-(this.spd-1)*1.5+2});
                    }
                }
            });
        }
        
        return safePoints;
    }

    // 在AiRole类中添加Attack相关方法

    // 1. 构建玩家可安全到达的图
    buildSafeGraph(m, bombs, ex, player) {
        const graph = new Map(); // 邻接表存储图
        const vis = Array(GRID).fill().map(() => Array(GRID).fill(false));
        const q = [{x: player.gx, y: player.gy}];
        vis[player.gy][player.gx] = true;
        
        while(q.length > 0) {
            const cur = q.shift();
            const key = `${cur.x},${cur.y}`;
            if(!graph.has(key)) {
                graph.set(key, []);
            }
            
            DIR.forEach(d => {
                const nx = cur.x + d[0];
                const ny = cur.y + d[1];
                
                // 检查边界和是否已访问
                if(nx < 0 || nx >= GRID || ny < 0 || ny >= GRID || vis[ny][nx]) {
                    return;
                }
                
                // 检查是否是空地
                if(m[ny][nx] !== TYPE.EMPTY) {
                    return;
                }
                
                // 检查是否有炸弹
                const hasBomb = bombs.some(b => b.gx === nx && b.gy === ny && b.timer > 0);
                if(hasBomb) {
                    return;
                }
                
                // 检查是否有爆炸
                const hasExplosion = ex.some(e => e.gx === nx && e.gy === ny && e.life > 0);
                if(hasExplosion) {
                    return;
                }
                
                vis[ny][nx] = true;
                const neighborKey = `${nx},${ny}`;
                
                // 添加边
                graph.get(key).push(neighborKey);
                if(!graph.has(neighborKey)) {
                    graph.set(neighborKey, []);
                }
                graph.get(neighborKey).push(key);
                
                q.push({x: nx, y: ny});
            });
        }
        
        return graph;
    }

    // 2. Tarjan算法找割点
    findArticulationPoints(graph) {
        const articulationPoints = new Set();
        const visited = new Set();
        const discoveryTime = new Map();
        const lowTime = new Map();
        const parent = new Map();
        let time = 0;
        
        const dfs = (node, isRoot = false) => {
            visited.add(node);
            discoveryTime.set(node, time);
            lowTime.set(node, time);
            time++;
            let children = 0;
            
            const neighbors = graph.get(node) || [];
            for(const neighbor of neighbors) {
                if(!visited.has(neighbor)) {
                    children++;
                    parent.set(neighbor, node);
                    dfs(neighbor);
                    
                    lowTime.set(node, Math.min(lowTime.get(node), lowTime.get(neighbor)));
                    
                    // 割点判断条件
                    if((isRoot && children > 1) || (!isRoot && lowTime.get(neighbor) >= discoveryTime.get(node))) {
                        articulationPoints.add(node);
                    }
                } else if(neighbor !== parent.get(node)) {
                    lowTime.set(node, Math.min(lowTime.get(node), discoveryTime.get(neighbor)));
                }
            }
        };
        
        // 从每个未访问的节点开始DFS
        for(const node of graph.keys()) {
            if(!visited.has(node)) {
                dfs(node, true);
            }
        }
        
        return articulationPoints;
    }

    // 3. 评估割点价值
    evaluateArticulationPoint(point, graph, player, ai) {
        const [px, py] = point.split(',').map(Number);
        const aiPos = {x: ai.gx, y: ai.gy};
        
        // 计算从AI到割点的距离
        const aiDistance = Math.hypot(px - aiPos.x, py - aiPos.y);
        
        // 计算从玩家到割点的距离
        const playerDistance = Math.hypot(px - player.gx, py - player.gy);
        
        // 计算割点的度数（连接的边数）
        const degree = (graph.get(point) || []).length;
        
        // 计算移除该点后图的变化（简化计算：使用度数作为代理）
        const impactScore = degree * 10;
        
        // 综合评分：考虑距离、影响度和随机性
        // 距离越近越好，影响度越高越好
        let score = impactScore - aiDistance * 2 - playerDistance;
        
        // 加入随机性
        score += Math.random() * 20;
        
        return {
            point,
            score,
            aiDistance,
            playerDistance,
            degree
        };
    }

    // 4. 选择最优割点
    selectBestArticulationPoint(articulationPoints, graph, player, ai) {
        if(articulationPoints.size === 0) {
            return null;
        }
        
        let bestPoint = null;
        let bestScore = -Infinity;
        
        for(const point of articulationPoints) {
            const evaluation = this.evaluateArticulationPoint(point, graph, player, ai);
            
            if(evaluation.score > bestScore) {
                bestScore = evaluation.score;
                bestPoint = evaluation;
            }
        }
        
        return bestPoint;
    }

    // 5. 执行攻击策略
    executeAttack(m, bombs, ex, allRoles, player) {
        // 检查AI是否可以放炸弹
        if(this.bombCd > 0 || this.bombUsed >= this.bombMax) {
            return false;
        }
        
        // 检查当前位置是否危险
        if(this.isDanger(m, bombs, ex)) {
            return false;
        }
        
        // 构建玩家可安全到达的图
        const graph = this.buildSafeGraph(m, bombs, ex, player);
        
        if(graph.size === 0) {
            return false;
        }
        
        // 找出割点
        const articulationPoints = this.findArticulationPoints(graph);
        
        if(articulationPoints.size === 0) {
            return false;
        }
        
        // 选择最优割点
        const bestPoint = this.selectBestArticulationPoint(articulationPoints, graph, player, this);
        
        if(!bestPoint) {
            return false;
        }
        
        // 检查AI是否可以到达割点
        const [targetX, targetY] = bestPoint.point.split(',').map(Number);
        const path = this.bfs(this.gx, this.gy, targetX, targetY, this);
        
        if(!path || path.length === 0) {
            return false;
        }
        
        // 如果割点在攻击范围内，放炸弹
        const distToTarget = Math.hypot(targetX - this.gx, targetY - this.gy);
        if(distToTarget <= this.pow * TILE) {
            // 检查放炸弹后是否有安全逃生路径
            if(this.canSafelyEscapeAfterBomb(m, bombs, ex, allRoles)) {
                // 放置炸弹
                this.bombUsed++;
                this.bombCd = CFG.BOMB_COOLDOWN;
                bombs.push(new Bomb(this.gx, this.gy, this));
                
                // 立即移动一步
                const dirs = [...DIR].sort(() => Math.random() - 0.5);
                for(const d of dirs) {
                    const nx = this.gx + d[0];
                    const ny = this.gy + d[1];
                    if(this.canMove(nx, ny, m, bombs, allRoles) && !this.isDanger(nx, ny, true)) {
                        this.move(nx, ny);
                        break;
                    }
                }
                
                return true;
            }
        } else {
            // 移动向割点
            this.move(this.gx + path[0][0], this.gy + path[0][1]);
            return true;
        }
        
        return false;
    }

    // 6. 检查放炸弹后是否有安全逃生路径
    canSafelyEscapeAfterBomb(m, bombs, ex, allRoles) {
        // 创建测试炸弹
        const testBomb = new Bomb(this.gx, this.gy, this);
        const bombRange = testBomb.getRange(m);
        
        // 找出爆炸范围内的所有位置
        const dangerPositions = new Set();
        bombRange.forEach(p => {
            dangerPositions.add(`${p.gx},${p.gy}`);
        });
        
        // 使用BFS找出所有可达的安全位置
        const vis = Array(GRID).fill().map(() => Array(GRID).fill(false));
        const q = [{x: this.gx, y: this.gy}];
        vis[this.gy][this.gx] = true;
        
        let safeCount = 0;
        let ptr = 0;
        
        while(ptr < q.length && ptr < 200) {
            const c = q[ptr++];
            
            // 如果当前位置不在爆炸范围内，算作安全位置
            if(!dangerPositions.has(`${c.x},${c.y}`)) {
                safeCount++;
                if(safeCount >= 1) return true;
            }
            
            // 探索相邻位置
            for(const d of DIR) {
                const nx = c.x + d[0];
                const ny = c.y + d[1];
                
                // 检查是否可以移动到该位置
                if(this.canMove(nx, ny, m, bombs, allRoles) && !vis[ny][nx]) {
                    // 检查该位置是否在爆炸范围内
                    const inDanger = dangerPositions.has(`${nx},${ny}`);
                    
                    if(!inDanger) {
                        vis[ny][nx] = true;
                        q.push({x: nx, y: ny});
                    }
                }
            }
        }
        
        return safeCount >= 1;
    }

    // 7. 主攻击方法
    attack(m, bombs, ex, allRoles) {
        if(this.dead) return false;
        
        const player = allRoles.find(r => !r.isAI);
        if(!player || player.dead) return false;
        
        // 根据AI的炸弹数量决定攻击次数
        const attackCount = this.bombMax - this.bombUsed;
        
        for(let i = 0; i < attackCount; i++) {
            const success = this.executeAttack(m, bombs, ex, allRoles, player);
            if(!success) break;
        }
        
        return true;
    }

    decision(m, bombs, ex, allRoles) {
        if(this.dead) return;
        this.update();
        const gx = this.gx; 
        const gy = this.gy;
        const p = allRoles.find(d => !d.isAI);
        // 最高优先级：躲炸弹，if you can move
        if(this.moveCd <= 0 && this.isDanger(m, bombs, ex)){
            const sp = this.escapeDfs(m, bombs, ex, allRoles);
            const ok = [];
            DIR.forEach(d => {
                const nx = this.gx+d[0], ny = this.gy+d[1];
                if (nx < GRID && ny < GRID && nx >= 0 && ny >= 0 && sp[nx][ny] && !ex.some(e.gx == nx && e.gy == ny && e.life > 0))
                    ok.push({x:nx, y:ny});
            });
            if (ok.length>0) {
                const pos = ok[Math.min(Math.floor(Math.random()*ok.length), ok.length-1)];
                return this.move(pos.x, pos.y);
            }
        }
        // Attack
        if(!p.dead) {

            const pts=this.available(m, bombs, ex, allRoles);
        }
        // 第三优先级：捡道具
        const availItems = this.items.filter(i=>!this.isDanger(i.gx,i.gy, true) && 
                                                (i.t===ITEM.POW || i.t===ITEM.BOMB_CNT));
        if(availItems.length && Math.random() > 0.5){
            const targetItem = availItems.reduce((a,b)=>
                Math.hypot(a.gx-gx,a.gy-gy) < Math.hypot(b.gx-gx,b.gy-gy) ? a : b
            );
            
            const itemPath = this.bfs(gx,gy,targetItem.gx,targetItem.gy,this);
            if(itemPath && itemPath.length){
                this.move(gx + itemPath[0][0], gy + itemPath[0][1]);
                return;
            }
        }

        // 第四优先级：主动开路（新增逻辑）
        if(this.findAndBreakWall(this)) return;

        // 最低优先级：随机移动（仅当无其他目标时）
        if(Math.random() < 0.2){
            const dirs = [...DIR].sort(()=>Math.random()-.5);
            for(let d of dirs) {
                const nx = gx + d[0]; 
                const ny = gy + d[1];
                if(this.canMove(nx,ny,this.m,this.bombs,allRoles) && !this.isDanger(nx,ny, true)){
                    this.move(nx,ny);
                    break;
                }
            }
        }
    }
}