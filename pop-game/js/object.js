const GRID = 17, TILE = 20;
const TYPE = {EMPTY:0, WALL:1, BRICK:2, BOMB:3, EXPLOSION:4};
const ITEM = {POW:1, SPD:2, BTIME:3, BOMB_CNT:4};
const DIR = [[0,-1],[0,1],[-1,0],[1,0]];

// 核心优化：大幅提升AI攻击性配置
const CFG = {
    BOMB:1, POW:1, SPD:1,
    BASE_BTIME:180,
    MIN_BTIME:90,
    MOVE:8,          
    BOMB_COOLDOWN:2, // 【关键】减少炸弹冷却，增加放弹频率
    INVINCIBLE:15,
    REBORN_INV:60,
    AI_PATH_LEN:50,      // 【关键】增加AI路径长度
    AI_ESCAPE_LEN:30,    // 减少逃生路径长度，优先攻击
    AI_CHASE_RANGE:300,  // 【关键】大幅扩大AI追击范围
    AI_ATTACK_RANGE:80,  // 【关键】缩小攻击触发距离，更近距离精准攻击
    AI_REACT_SPEED:1,    // 【关键】AI每帧都反应，大幅提升反应速度
    AI_PREDICT_STEPS:4,  // 【关键】增加预判步数，提前拦截玩家
    AI_ATTACK_CHANCE:1.0,
    AI_BREAK_WALL_CHANCE:1.0, // 【关键】降低拆墙优先级，优先攻击玩家
    ITEM_RATE:0.7,
    MAX_BOMB:4,
    MAX_POW:5,
    MAX_SPD:4,
    BRICK_RATE:0.65,
    MAX_LIFE:3,
    MAX_BFS_ITER:500,    // 【关键】增加BFS迭代次数，路径规划更完整
    MAX_QUEUE_LEN:500,   // 【关键】增加BFS队列长度
    TARGET_FPS:60,
    MAX_BOMBS:10,
    MAX_EXPLOSIONS:30,
    MAX_ITEMS:20,
    AI_DANGER_TIMER:40   // 【关键】降低危险检测阈值，更晚逃生，更敢攻击
};

class GridObj {
    constructor(gx, gy) {
        this.gx = gx; this.gy = gy;
        this.px = gx * TILE + TILE/2;
        this.py = gy * TILE + TILE/2;
    }
}

class Role extends GridObj {
    constructor(gx, gy, isAI = false) {
        super(gx, gy);
        this.isAI = isAI;
        this.bombMax = CFG.BOMB;
        this.bombUsed = 0;
        this.pow = CFG.POW;
        this.spd = CFG.SPD;
        this.bTime = CFG.BASE_BTIME;
        this.maxLife = CFG.MAX_LIFE;
        this.life = CFG.MAX_LIFE;
        this.dead = false;
        this.inv = 0;
        this.moveCd = 0;
        this.bombCd = 0;
        this.lastDir = [0, 0];
        this.rebornCd = 0;
        this.respawnPos = [gx, gy];
    }

    pick(t) {
        if(t===ITEM.POW) this.pow = Math.min(this.pow+1, CFG.MAX_POW);
        if(t===ITEM.SPD) this.spd = Math.min(this.spd+1, CFG.MAX_SPD);
        if(t===ITEM.BTIME) this.bTime = Math.max(CFG.MIN_BTIME, this.bTime-22);
        if(t===ITEM.BOMB_CNT) this.bombMax = Math.min(this.bombMax+1, CFG.MAX_BOMB);
    }

    update() {
        if(this.inv>0) this.inv--;
        if(this.moveCd>0) this.moveCd--;
        if(this.bombCd>0) this.bombCd--;
        if(this.rebornCd>0) this.rebornCd--;
    }

    canMove(gx, gy, map, bombs, allRoles = []) {
        if(gx<1 || gx>=GRID-1 || gy<1 || gy>=GRID-1) return false;
        if(this.moveCd>0 || this.rebornCd>0) return false;
        if(map[gy][gx]===TYPE.WALL || map[gy][gx]===TYPE.BRICK) return false;
        
        let hasBomb = false;
        for(let i=0; i<bombs.length; i++) {
            const b = bombs[i];
            if(b.gx===gx && b.gy===gy && b.timer > 0) {
                hasBomb = true;
                break;
            }
        }
        if(hasBomb) return false;
        
        for(let i=0; i<allRoles.length; i++) {
            const r = allRoles[i];
            if(r !== this && !r.dead && r.rebornCd === 0 && r.gx === gx && r.gy === gy) {
                return false;
            }
        }
        return true;
    }

    move(gx, gy) {
        const newDir = [gx - this.gx, gy - this.gy];
        if(newDir[0] !== 0 || newDir[1] !== 0) {
            this.lastDir = newDir;
        }
        
        this.gx = gx; this.gy = gy;
        this.px = gx * TILE + TILE/2;
        this.py = gy * TILE + TILE/2;
        this.moveCd = Math.max(1, CFG.MOVE - (this.spd - 1) * 1.5);
    }

    loseLife() {
        if(this.inv > 0 || this.dead) return false;
        
        this.life--;
        this.inv = CFG.REBORN_INV;
        this.rebornCd = 30;
        
        if(this.life <= 0) {
            this.dead = true;
            return true;
        }
        
        this.gx = this.respawnPos[0];
        this.gy = this.respawnPos[1];
        
        this.px = this.gx * TILE + TILE/2;
        this.py = this.gy * TILE + TILE/2;
        return false;
    }

}

class Bomb extends GridObj {
    constructor(gx, gy, owner) {
        super(gx, gy);
        this.owner = owner;
        this.pow = owner.pow;
        this.timer = owner.bTime;
        this.radius = TILE * 0.35;
    }

    update() { 
        return --this.timer <= 0; 
    }

    getRange(map) {
        let r = [{gx:this.gx, gy:this.gy}];
        DIR.forEach(d=>{
            for(let i=1;i<=this.pow;i++){
                let nx = this.gx + d[0]*i;
                let ny = this.gy + d[1]*i;
                if(nx<0||nx>=GRID||ny<0||ny>=GRID) break;
                
                r.push({gx:nx, gy:ny});
                
                if(map[ny][nx]===TYPE.WALL) break;
                if(map[ny][nx]===TYPE.BRICK) break;
            }
        });
        return r;
    }

    isCovers(gx, gy, map) {
        const range = this.getRange(map);
        for(let i=0; i<range.length; i++) {
            const p = range[i];
            if(p.gx === gx && p.gy === gy) return true;
        }
        return false;
    }
}

class Item extends GridObj {
    constructor(gx, gy, t) {
        super(gx, gy);
        this.t = t; 
        this.life = 600;
    }

    update() { 
        return --this.life <= 0; 
    }
}

class Explode extends GridObj {
    constructor(gx, gy) {
        super(gx, gy);
        this.life = 24;
    }

    update() { 
        return --this.life <= 0; 
    }
}