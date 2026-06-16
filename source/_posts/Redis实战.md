---
title: Redis实战
date: 2024-03-05 17:06:55
tags:
  - 非关系型数据库
categories:
  - 中间件
  - 非关系型数据库
---
# 缓存
## 缓存更新策略

缓存更新策略的最佳实践方案：

1. 低一致性需求：使用 Redis 自带的内存淘汰机制
2. 高一致性需求：主动更新，并以超时剔除作为兜底方案
   ◆ 读操作：
   • 缓存命中则直接返回
   • 缓存未命中则查询数据库，并写入缓存，设定超时时间
   ◆ 写操作：
   • 先写数据库，然后再删除缓存
   • 要确保数据库与缓存操作的原子性
## 缓存穿透
缓存穿透是指客户端请求的数据在缓存中和数据库中都不存在，这样缓存永远不会生效，这些请求都会打到数据库。
常见的解决方案有两种：
1. 缓存空对象
- **优点**：实现简单，维护方便
- **缺点**：
    - 额外的内存消耗
    - 可能造成短期的不一致
2. 布隆过滤
-   **优点**：内存占用较少，没有多余 key
-   **缺点**：
    -   实现复杂
    -   存在误判可能
<div align="center">   <img src="https://cdn.jsdelivr.net/gh/Omamori-P/PicList-Image-Hosting@main/blog/2026-06-01-20260601213933975.webp" alt="image" width="100%"> </div>

### 缓存空对象
其核心思想是：**当查询数据库未命中（返回空结果）时，仍将“空值”写入缓存**，并设置较短的过期时间，避免后续相同请求直接穿透到底层存储。

| 要点         | 说明                                         |
| ---------- | ------------------------------------------ |
| **空值标识**   | 使用特殊值（如 `NULL`、`EMPTY`、固定字符串）区分“无数据”与“未缓存” |
| **TTL 设置** | 建议 **5–30 秒**（避免长期占用内存，又能挡住瞬时攻击）           |
| **Key 设计** | 与原 Key 一致，避免额外复杂度                          |
| **一致性**    | 若后续数据被插入，需主动删除/更新空缓存                       |

<div align="center">   <img src="https://cdn.jsdelivr.net/gh/Omamori-P/PicList-Image-Hosting@main/blog/2026-06-02-20260602123952091.webp" alt="image" width="100%"> </div>

示例代码如下：
```java
@Override  
public Result queryById(Long id) {  
    // 从redis查询缓存  
    String shopJson = stringRedisTemplate.opsForValue().get(RedisConstants.CACHE_SHOP_KEY + id);  
    if (StrUtil.isNotBlank(shopJson)) {  
        // 存在，直接返回  
        Shop shop = JSONUtil.toBean(shopJson, Shop.class);  
        return Result.ok(shop);  
    }  
    // 判断是否命中空值  
    if (shopJson != null) {  
        return Result.fail("店铺不存在");  
    }  
    // 不存在，查询数据库  
    Shop shop = this.getById(id);  
    if (shop == null) {  
        // 将空值写入redis  
        stringRedisTemplate.opsForValue().set(RedisConstants.CACHE_SHOP_KEY + id, "", RedisConstants.CACHE_NULL_TTL, TimeUnit.MINUTES);  
        return Result.fail("店铺不存在");  
    }  
    // 重建缓存  
    stringRedisTemplate.opsForValue().set(RedisConstants.CACHE_SHOP_KEY + id, JSONUtil.toJsonStr(shop));  
    stringRedisTemplate.expire(RedisConstants.CACHE_SHOP_KEY + id, RedisConstants.CACHE_SHOP_TTL, TimeUnit.MINUTES);  
    return Result.ok(shop);  
}
```
### 布隆过滤
此处暂时无内容
## 缓存雪崩

缓存雪崩是指在同一时段大量的缓存 key 同时失效或者 Redis 服务宕机，导致大量请求到达数据库，带来巨大压力。
解决方案：

- 给不同的 Key 的 TTL 添加随机值

- 利用 Redis 集群提高服务的可用性

- 给缓存业务添加降级限流策略

- 给业务添加多级缓存

## 缓存击穿
缓存击穿问题也叫热点 Key 问题，就是一个被**高并发访问**并且**缓存重建业务较复杂**的 key 突然失效了，无数的请求访问会在瞬间给数据库带来巨大的冲击。
### 互斥锁
cache miss 时，抢一把分布式锁；抢到的去查 DB 并回写缓存；没抢到的**等一等再读缓存**。
<div align="center">   <img src="https://cdn.jsdelivr.net/gh/Omamori-P/PicList-Image-Hosting@main/blog/2026-06-02-20260602131637582.webp" alt="image" width="60%"> </div>

示例代码：
```java
public Shop queryWithMutex(Long id) {  
    // 从redis查询缓存  
    String shopJson = stringRedisTemplate.opsForValue().get(RedisConstants.CACHE_SHOP_KEY + id);  
    if (StrUtil.isNotBlank(shopJson)) {  
        // 存在，直接返回  
        return JSONUtil.toBean(shopJson, Shop.class);  
    }  
    // 判断是否命中空值 -解决缓存穿透  
    if (shopJson != null) {  
        return null;  
    }  
    // 缓存不存在 执行缓存重建  
    Shop shop = null;  
    try {  
        boolean isLock = tryLock(RedisConstants.LOCK_SHOP_KEY + id);  
        if (!isLock) {  
            // 获取锁失败 休眠重试  
            Thread.sleep(50);  
            return queryWithMutex(id);  
        }  
        // 不存在，查询数据库  
        shop = this.getById(id);  
        if (shop == null) {  
            // 将空值写入redis -解决缓存穿透  
            stringRedisTemplate.opsForValue().set(RedisConstants.CACHE_SHOP_KEY + id, "", RedisConstants.CACHE_NULL_TTL, TimeUnit.MINUTES);  
            return null;  
        }  
        // 重建缓存  
        stringRedisTemplate.opsForValue().set(RedisConstants.CACHE_SHOP_KEY + id, JSONUtil.toJsonStr(shop));  
        stringRedisTemplate.expire(RedisConstants.CACHE_SHOP_KEY + id, RedisConstants.CACHE_SHOP_TTL, TimeUnit.MINUTES);  
    } catch (InterruptedException e) {  
        throw new RuntimeException(e);  
    } finally {  
        // 释放锁  
        unLock(RedisConstants.LOCK_SHOP_KEY + id);  
    }  
    return shop;  
}
```
### 逻辑过期
缓存 value 里自带一个 `expireAt`，但 Redis key 本身不设 TTL（或 TTL 设很长）。读的时候发现“快过期了”，**仍然返回旧数据**，然后让一个线程去异步刷新。
<div align="center">   <img src="https://cdn.jsdelivr.net/gh/Omamori-P/PicList-Image-Hosting@main/blog/2026-06-02-20260602131725923.webp" alt="image" width="100%"> </div>

示例代码：
```java
public Shop queryWithLogicalExpire(Long id) {  
    // 从redis查询缓存  
    String shopJson = stringRedisTemplate.opsForValue().get(RedisConstants.CACHE_SHOP_KEY + id);  
    if (StrUtil.isBlank(shopJson)) {  
        // 缓存未命中  
        return null;  
    }  
    // 命中，需要先把json反序列化为对象  
    RedisData redisData = JSONUtil.toBean(shopJson, RedisData.class);  
    Shop shop = JSONUtil.toBean((JSONObject) redisData.getData(), Shop.class);  
    LocalDateTime expireTime = redisData.getExpireTime();  
    if (expireTime.isAfter(LocalDateTime.now())) {  
        // 未过期，直接返回店铺信息  
        return shop;  
    }  
    // 过期，需要缓存重建  
    String lock = RedisConstants.LOCK_SHOP_KEY + id;  
    boolean isLock = tryLock(lock);  
    if (isLock) {  
        // 获取锁成功，开启独立线程，实现缓存重建  
        CACHE_REBUILD_EXECUTOR.submit(() -> {  
            // 缓存重建  
            try {  
                // 双重检查：再次查询缓存，判断是否需要重建  
                String cacheShop = stringRedisTemplate.opsForValue().get(RedisConstants.CACHE_SHOP_KEY + id);  
                if (StrUtil.isNotBlank(cacheShop)) {  
                    RedisData cachedRedisData = JSONUtil.toBean(cacheShop, RedisData.class);  
                    LocalDateTime cachedExpireTime = cachedRedisData.getExpireTime();  
                    // 如果缓存仍未过期，说明其他线程已经重建过了  
                    if (cachedExpireTime.isAfter(LocalDateTime.now())) {  
                        return;  
                    }  
                }  
                // 缓存重建  
                this.saveShop2Redis(id, 20L);  
            } catch (Exception e) {  
                throw new RuntimeException(e);  
            } finally {  
                unLock(lock);  
            }  
        });  
    }  
    // 返回过期数据  
    return shop;  
}
```
# 优惠券秒杀
## 全局唯一ID

使用 Redis 生成全局唯一 ID 的核心是利用其 **原子操作**（如 `INCR`、`INCRBY`）和 **单线程模型** 来保证并发安全。最常用且高效的方式是 **自增序列号**，也可结合时间戳、业务标识等生成语义化 ID。

示例代码：

```java
@Component
public class RedisIdWorker {

    private static final long START_TIME = 1640995200L;

    private static final long COUNT_BITS = 32;

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    public long nextId(String keyPrefix) {
        // 获取时间戳
        long now = System.currentTimeMillis();
        long timestamp = now - START_TIME;

        // 生成序列号
        String date = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy:MM:dd"));
        Long id = stringRedisTemplate.opsForValue().increment("icr:" + keyPrefix + ":" + date);
        // 拼接返回
        return timestamp << COUNT_BITS | id;
    }
}
```

## 乐观锁解决超买

**乐观锁（Optimistic Locking）** 的核心思想是：

> **假设并发冲突很少发生，只在更新时检查数据是否被别人改过。**

它**不加物理锁**（不像 `SELECT FOR UPDATE`），而是通过 **版本号 / 时间戳 / 条件判断** 来实现并发安全。

在库存扣减场景下，利用条件判断（无版本号）进行控制：

```sql
UPDATE coupon
SET stock = stock - 1
WHERE id = #{id} AND stock > 0;

# 下面这种方式会导致失败率高 不采用
UPDATE coupon
SET stock = stock - 1
WHERE id = #{id} AND stock = #{stock};
```

示例代码如下：

```java
@Transactional(rollbackFor = Exception.class)
    public Result seckillVoucher(Long voucherId) {
        // 查询优惠券信息
        SeckillVoucher seckillVoucher = seckillVoucherService.getById(voucherId);
        if (seckillVoucher.getBeginTime().isAfter(LocalDateTime.now())) {
            return Result.fail("秒杀尚未开始");
        }
        if (seckillVoucher.getEndTime().isBefore(LocalDateTime.now())) {
            return Result.fail("秒杀已经结束");
        }
        if (seckillVoucher.getStock() < 1) {
            return Result.fail("库存不足");
        }
        // 扣减库存 -乐观锁
        boolean success = seckillVoucherService.update().setSql("stock = stock - 1")
                .eq("voucher_id", voucherId)
                .gt("stock", 0)
                .update();
        if (!success) {
            return Result.fail("库存不足");
        }
        // 创建订单
        VoucherOrder voucherOrder = new VoucherOrder();
        voucherOrder.setId(redisIdWorker.nextId("order"));
        voucherOrder.setUserId(UserHolder.getUser().getId());
        voucherOrder.setVoucherId(voucherId);
        save(voucherOrder);
        return Result.ok(voucherOrder.getId());
    }
```

## 一人一单

其核心策略是采用**分层防御**：**JVM 锁**负责拦截同一用户的并发请求，**数据库乐观锁**负责拦截所有用户的库存争抢，而**事务**则保证下单过程的原子性。

为了防止同一个用户重复下单，使用了 `synchronized (userId.toString().intern())`。这里的 `intern()`方法至关重要，它将字符串对象强制放入常量池，确保在整个 JVM 中，相同的用户 ID 对应同一把锁。这保证了同一个用户的所有请求必须串行执行，从根本上杜绝了“一人多单”的逻辑漏洞。

在锁的内部，代码首先查询数据库判断该用户是否已经下过单（`count > 0`）。这一步是**幂等性校验**。因为查询和插入是两个操作，如果不加锁，并发请求可能会同时查到“未下单”的状态，从而导致重复插入。因此，**“查询订单 + 创建订单”必须被包含在 `synchronized`代码块中**。

代码没有使用 `@Transactional`注解，而是手动注入了 `PlatformTransactionManager`。这是为了在 `synchronized`代码块内部精确控制事务的边界，避免锁在事务提交之前释放。将**库存扣减**和**订单创建**放在同一个事务中，确保要么两者都成功，要么在发生异常时通过 `rollback`回滚，保证数据一致性。

示例代码：

```java
 @Autowired
    private PlatformTransactionManager transactionManager;

    @Override
    public Result seckillVoucher(Long voucherId) {
        // 查询优惠券信息
        SeckillVoucher seckillVoucher = seckillVoucherService.getById(voucherId);
        if (seckillVoucher.getBeginTime().isAfter(LocalDateTime.now())) {
            return Result.fail("秒杀尚未开始");
        }
        if (seckillVoucher.getEndTime().isBefore(LocalDateTime.now())) {
            return Result.fail("秒杀已经结束");
        }
        if (seckillVoucher.getStock() < 1) {
            return Result.fail("库存不足");
        }
        // 一人一单
        Long userId = UserHolder.getUser().getId();
        synchronized (userId.toString().intern()) {
            int count = query().eq("user_id", userId).eq("voucher_id", voucherId).count();
            if (count > 0) {
                return Result.fail("您已经购买过一次");
            }
            // 开启事务
            DefaultTransactionDefinition def = new DefaultTransactionDefinition();
            def.setPropagationBehavior(DefaultTransactionDefinition.PROPAGATION_REQUIRED);
            TransactionStatus status = transactionManager.getTransaction(def);

            try {
                // 扣减库存 -乐观锁
                boolean success = seckillVoucherService.update().setSql("stock = stock - 1")
                        .eq("voucher_id", voucherId)
                        .gt("stock", 0)
                        .update();
                if (!success) {
                    transactionManager.rollback(status);
                    return Result.fail("库存不足");
                }

                // 创建订单
                VoucherOrder voucherOrder = new VoucherOrder();
                voucherOrder.setId(redisIdWorker.nextId("order"));
                voucherOrder.setUserId(UserHolder.getUser().getId());
                voucherOrder.setVoucherId(voucherId);
                save(voucherOrder);

                // 提交事务
                transactionManager.commit(status);
                return Result.ok(voucherOrder.getId());
            } catch (Exception e) {
                // 发生异常时回滚事务
                transactionManager.rollback(status);
                throw new RuntimeException(e);
            }
        }
    }
```

## 异步秒杀

1. 流量拦截（Redis + Lua）

- **Lua 脚本原子性校验**：Lua 脚本在 Redis 中执行，保证了**原子性**。它通常做两件事：
    1. **库存判断**：判断 Redis 中的库存是否大于 0（库存需要预先存储在redis）。
    2. **一人一单**：判断用户 ID 是否已经存在于抢购成功的 Set 中（防止重复下单）。
- **快速失败**：如果脚本返回 `1`（库存不足）或 `2`（已下单），直接返回错误信息，**请求在此结束，不触及数据库**

2. 异步解耦（消息队列）

如果 Lua 脚本校验通过：

- **构建订单对象**：创建 订单对象。
- **放入消息队列**：将订单存储进消息队列

3. 即时响应

- 只要订单成功放入队列，请求就立即返回成功
- **用户体验**：用户感觉下单很快，不需要等待数据库操作完成。

4. 后台消费

- 不断从消息队列中获取订单并进行落库处理

<div align="center">   <img src="https://cdn.jsdelivr.net/gh/Omamori-P/PicList-Image-Hosting@main/blog/2026-06-03-image-20260603223737716.webp" alt="image" width="100%"> </div>

### 阻塞队列实现

**极高的并发承载能力**：利用 **Redis + Lua 脚本**在内存层面完成核心校验（库存、一人一单），避免了直接冲击数据库，能够轻松应对瞬时高并发流量。

**有效的流量削峰填谷**：通过 **内存阻塞队列（BlockingQueue）** 将同步请求转化为异步处理，将瞬间的下单压力平摊到后台线程慢慢消化，保护了数据库不被击穿。

**彻底解决超卖与重复下单**：结合 **Redis Set 判重** 和数据库的 **乐观锁（WHERE stock > 0）**，从缓存层到数据库层双重保障，确保了数据准确性。

**内存队列风险**：

- **问题**：JVM 内存队列不可靠。
- **优化**：生产环境应使用 **持久化的消息队列**（如 RocketMQ、RabbitMQ 或 Kafka）。

**异常处理**：

- **问题**：`catch`里直接 `throw new RuntimeException(e)`，如果这个线程挂了，后续订单没人处理了。
- **优化**：捕获异常后记录日志，标记订单为失败状态，并可以考虑恢复库存（回滚 Redis）。

Lua脚本如下：

```lua
-- 优惠券id
local voucherId = ARGV[1]
-- 用户id
local userId = ARGV[2]

-- 库存key
local stockKey = "seckill:stock:" .. voucherId
-- 订单key
local orderKey = "seckill:order:" .. voucherId

-- 判断库存是否充足
if (tonumber(redis.call("get", stockKey)) <= 0) then
    -- 库存不足
    return 1
end
-- 判断用户是否重复下单
if (redis.call("sismember", orderKey, userId) == 1) then
    -- 重复下单
    return 2
end
-- 扣减库存
redis.call("incrby", stockKey, -1)
-- 记录用户
redis.call("sadd", orderKey, userId)

return 0
```



示例代码：

```java
@Autowired
    private StringRedisTemplate stringRedisTemplate;

    private final static DefaultRedisScript<Long> SECKILL_SCRIPT;

    private BlockingQueue<VoucherOrder> orderTasks = new ArrayBlockingQueue<>(1024 * 1024);
	// 正式环境请使用自定义线程池
    private static final ExecutorService SECKILL_ORDER_EXECUTOR = Executors.newSingleThreadExecutor();

    static {
        SECKILL_SCRIPT = new DefaultRedisScript<>();
        SECKILL_SCRIPT.setLocation(new ClassPathResource("seckill.lua"));
        SECKILL_SCRIPT.setResultType(Long.class);
    }

    @PostConstruct
    void init() {
        SECKILL_ORDER_EXECUTOR.submit(new VoucherOrderHandler());
    }


    class VoucherOrderHandler implements Runnable {
        @Override
        public void run() {
            while (true) {
                try {
                    VoucherOrder voucherOrder = orderTasks.take();
                    handleVoucherOrder(voucherOrder);
                } catch (InterruptedException e) {
                    throw new RuntimeException(e);
                }
            }
        }
    }

    private void handleVoucherOrder(VoucherOrder voucherOrder) {
        TransactionStatus status = null;
        try {
            // 开启事务
            DefaultTransactionDefinition def = new DefaultTransactionDefinition();
            def.setPropagationBehavior(DefaultTransactionDefinition.PROPAGATION_REQUIRED);
            status = transactionManager.getTransaction(def);
            // 扣减库存 -乐观锁
            boolean success = seckillVoucherService.update().setSql("stock = stock - 1")
                    .eq("voucher_id", voucherOrder.getVoucherId())
                    .gt("stock", 0)
                    .update();
            if (!success) {
                transactionManager.rollback(status);
            }

            // 创建订单
            save(voucherOrder);

            // 提交事务
            transactionManager.commit(status);
        } catch (Exception e) {
            // 发生异常时回滚事务
            transactionManager.rollback(status);
            throw new RuntimeException(e);
        }
    }

    @Override
    public Result seckillVoucher(Long voucherId) throws InterruptedException {
        // 执行Lua脚本 进行资格判断
        Long res = stringRedisTemplate.execute(SECKILL_SCRIPT, Collections.emptyList(),
                voucherId.toString(), UserHolder.getUser().getId().toString());
        if (res == 1) {
            return Result.fail("库存不足");
        }
        if (res == 2) {
            return Result.fail("请勿重复下单");
        }
        // 当前用户可以成功下单 保存至消息队列
        long orderId = redisIdWorker.nextId("order");
        // 创建订单
        VoucherOrder voucherOrder = new VoucherOrder();
        voucherOrder.setId(orderId);
        voucherOrder.setUserId(UserHolder.getUser().getId());
        voucherOrder.setVoucherId(voucherId);
        orderTasks.put(voucherOrder);
        return Result.ok(orderId);
    }
```



### Redis消息队列实现

Redis提供了三种不同的方式来实现消息队列：

- **list结构**：基于List结构模拟消息队列
- **PubSub**：基本的点对点消息模型
- **Stream**：比较完善的消息队列模型

#### List模拟消息队列

消息队列（Message Queue），字面意思就是存放消息的队列。而Redis的list数据结构是一个双向链表，很容易模拟出队列效果。

队列是入口和出口不在一边，因此我们可以利用：LPUSH 结合 RPOP、或者 RPUSH 结合 LPOP来实现。

不过要注意的是，当队列中没有消息时RPOP或LPOP操作会返回null，并不像JVM的阻塞队列那样会阻塞并等待消息。

因此这里应该使用**BRPOP**或者**BLPOP**来实现阻塞效果。

<div align="center">   <img src="https://cdn.jsdelivr.net/gh/Omamori-P/PicList-Image-Hosting@main/blog/2026-06-03-image-20260603225312250.webp" alt="image" width="100%"> </div>

**优点：**

- 利用Redis存储，不受限于JVM内存上限
- 基于Redis的持久化机制，数据安全性有保证
- 可以满足消息有序性

**缺点：**

- 无法避免消息丢失
- 只支持单消费者

#### 基于PubSub的消息队列

PubSub（发布订阅）是Redis2.0版本引入的消息传递模型。顾名思义，消费者可以订阅一个或多个channel，生产者向对应channel发送消息后，所有订阅者都能收到相关消息。

- **SUBSCRIBE channel [channel]**：订阅一个或多个频道
- **PUBLISH channel msg**：向一个频道发送消息
- **PSUBSCRIBE pattern[pattern]**：订阅与pattern格式匹配的所有频道

<div align="center">   <img src="https://cdn.jsdelivr.net/gh/Omamori-P/PicList-Image-Hosting@main/blog/2026-06-03-image-20260603230145763.webp" alt="image" width="100%"> </div>

**优点：**

- 采用发布订阅模型，支持多生产、多消费

**缺点：**

- 不支持数据持久化
- 无法避免消息丢失
- 消息堆积有上限，超出时数据丢失

#### 基于Stream的消息队列

Stream 是 Redis 5.0 引入的一种新数据类型，可以实现一个功能非常完善的消息队列。

##### 单消费者模式

<div align="center">   <img src="https://cdn.jsdelivr.net/gh/Omamori-P/PicList-Image-Hosting@main/blog/2026-06-04-image-20260604122835627.webp" alt="image" width="100%"> </div>

当我们指定起始ID为`$`时，代表读取最新的消息，如果我们处理一条消息的过程中，又有超过1条以上的消息到达队列，则下次获取时也只能获取到最新的一条，会出现**漏读消息**的问题。

<div align="center">   <img src="https://cdn.jsdelivr.net/gh/Omamori-P/PicList-Image-Hosting@main/blog/2026-06-04-image-20260604122929576.webp" alt="image" width="100%"> </div>

STREAM类型消息队列的XREAD命令特点：

● 消息可回溯

● 一个消息可以被多个消费者读取

● 可以阻塞读取

● 有消息漏读的风险

##### 消费组模式

消费者组（Consumer Group）：将多个消费者划分到一个组中，监听同一个队列。具备下列特点：

**1. 消息分流**

队列中的消息会分流给组内的不同消费者，而不是重复消费，从而加快消息处理的速度

**2. 消息标示**

消费者组会维护一个标示，记录最后一个被处理的消息，哪怕消费者宕机重启，还会从标示之后读取消息。确保每一个消息都会被消费

**3. 消息确认**

消费者获取消息后，消息处于pending状态，并存入一个pending-list。当处理完成后需要通过XACK来确认消息，标记消息为已处理，才会从pending-list移除。

创建消费者组：

```sh
XGROUP CREATE key groupName ID [MKSTREAM]
```

● **key**：队列名称

● **groupName**：消费者组名称

● **ID**：起始ID标示，`$`代表队列中最后一个消息，`0`则代表队列中第一个消息

● **MKSTREAM**：队列不存在时自动创建队列

其它常见命令：

```sh
# 删除指定的消费者组
XGROUP DESTROY key groupName

# 给指定的消费者组添加消费者
XGROUP CREATECONSUMER key groupname consumername

# 删除消费者组中的指定消费者
XGROUP DELCONSUMER key groupname consumername
```

从消费者组读取消息：

```sh
XREADGROUP GROUP group consumer [COUNT count] [BLOCK milliseconds] [NOACK] STREAMS key [key ...] ID [ID ...]
```

- **group**：消费组名称

- **consumer**：消费者名称，如果消费者不存在，会自动创建一个消费者

- **count**：本次查询的最大数量

-  **BLOCK milliseconds**：当没有消息时最长等待时间

- **NOACK**：无需手动ACK，获取到消息后自动确认

-  **STREAMS key**：指定队列名称

- **ID**：获取消息的起始ID：

​    	● `">"`：从下一个未消费的消息开始

   	 ● 其它：根据指定id从pending-list中获取已消费但未确认的消息，例如0，是从pending-list中的第一个消息开始

XACK向消费者组（Consumer Group）确认某条或多条消息已经被成功处理。当消费者调用此命令后，Redis 会将对应的消息从 `pending-list`（待确认列表）中移除，表示该消息已处理完毕，从而避免消息丢失。

```sh
XACK key group ID [ID ...]
```

- key：队列的名称。

- group：消费者组的名称。

- ID：需要确认的消息 ID。

STREAM类型消息队列的XREADGROUP命令特点：

- 消息可回溯

- 可以多消费者争抢消息，加快消费速度

-  可以阻塞读取

- 没有消息漏读的风险

-  有消息确认机制，保证消息至少被消费一次

####  基于Stream实现异步秒杀

整体流程如下：

1. 创建一个Stream类型的消息队列，名为stream.orders

   ```sh
   XREADGROUP GROUP g1 c1 count 1 block  2000 STREAMS  stream.orders 0
   ```

2. 修改之前的秒杀下单Lua脚本，在认定有抢购资格后，直接向stream.orders中添加消息，内容包含voucherId、userId、orderId

3. 项目启动时，开启一个线程任务，尝试获取stream.orders中的消息，完成下单

4. 项目停止时，任务循环自然退出，线程池停止接收新任务并等待正在执行的订单处理完成



Lua脚本实现如下：

```lua
-- 优惠券id
local voucherId = ARGV[1]
-- 用户id
local userId = ARGV[2]
-- 订单id
local orderId = ARGV[3]

-- 库存key
local stockKey = "seckill:stock:" .. voucherId
-- 订单key
local orderKey = "seckill:order:" .. voucherId

-- 判断库存是否充足
if (tonumber(redis.call("get", stockKey)) <= 0) then
    -- 库存不足
    return 1
end
-- 判断用户是否重复下单
if (redis.call("sismember", orderKey, userId) == 1) then
    -- 重复下单
    return 2
end
-- 扣减库存
redis.call("incrby", stockKey, -1)
-- 记录用户
redis.call("sadd", orderKey, userId)
-- 发送消息到队列中
redis.call("xadd", "stream.orders", "*", "userId", userId, "voucherId", voucherId, "id", orderId)
return 0
```

代码实现如下：

```java
 @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    private final static DefaultRedisScript<Long> SECKILL_SCRIPT;

    // 正式环境 请使用自定义线程池
    private static final ExecutorService SECKILL_ORDER_EXECUTOR = Executors.newSingleThreadExecutor();

    // 作为线程生命周期的控制标志
    private volatile boolean running = true;

    static {
        SECKILL_SCRIPT = new DefaultRedisScript<>();
        SECKILL_SCRIPT.setLocation(new ClassPathResource("seckill.lua"));
        SECKILL_SCRIPT.setResultType(Long.class);
    }

    @PostConstruct
    void init() {
        SECKILL_ORDER_EXECUTOR.submit(new VoucherOrderHandler());
    }

    @PreDestroy
    void destroy() {
        running = false;
        // 停止接收新任务
        SECKILL_ORDER_EXECUTOR.shutdown();
        try {
            // 给正在执行的任务最多3秒完成
            if (!SECKILL_ORDER_EXECUTOR.awaitTermination(3, TimeUnit.SECONDS)) {
                SECKILL_ORDER_EXECUTOR.shutdownNow();
            }
        } catch (InterruptedException e) {
            // 超时则 shutdownNow() 强制中断
            SECKILL_ORDER_EXECUTOR.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    class VoucherOrderHandler implements Runnable {
        private final static String QUEUE_NAME = "stream.orders";

        @Override
        public void run() {
            while (running) {
                try {
                    // 获取消息队列中的消息
                    List<MapRecord<String, Object, Object>> message = stringRedisTemplate.opsForStream().read(
                            Consumer.from("g1", "c1"),
                            StreamReadOptions.empty().count(1).block(Duration.ofSeconds(2)),
                            StreamOffset.create(QUEUE_NAME, ReadOffset.lastConsumed())
                    );
                    if (message == null || message.isEmpty()) {
                        // 获取失败，说明没有消息，继续获取
                        continue;
                    }
                    // 创建订单
                    Map<Object, Object> objectMap = message.get(0).getValue();
                    VoucherOrder voucherOrder = BeanUtil.fillBeanWithMap(objectMap, new VoucherOrder(), true);
                    handleVoucherOrder(voucherOrder);
                    // ACK确认
                    stringRedisTemplate.opsForStream().acknowledge(QUEUE_NAME, "g1", message.get(0).getId());
                } catch (Exception e) {
                    while (running) {
                        try {
                            // 获取pending-list中的消息
                            List<MapRecord<String, Object, Object>> message = stringRedisTemplate.opsForStream().read(
                                    Consumer.from("g1", "c1"),
                                    StreamReadOptions.empty().count(1).block(Duration.ofSeconds(2)),
                                    StreamOffset.create(QUEUE_NAME, ReadOffset.from("0"))
                            );
                            if (message == null || message.isEmpty()) {
                                // 获取失败，说明没有异常消息，停止处理
                                break;
                            }
                            // 创建订单
                            Map<Object, Object> objectMap = message.get(0).getValue();
                            VoucherOrder voucherOrder = BeanUtil.fillBeanWithMap(objectMap, new VoucherOrder(), true);
                            handleVoucherOrder(voucherOrder);
                            // ACK确认
                            stringRedisTemplate.opsForStream().acknowledge(QUEUE_NAME, "g1", message.get(0).getId());
                        } catch (Exception e1) {
                            log.error("处理异常订单异常", e1);
                            // 避免频繁的异常处理，休眠50毫秒
                            ThreadUtil.sleep(50);
                        }
                    }
                }
            }
        }
    }

    private void handleVoucherOrder(VoucherOrder voucherOrder) {
        TransactionStatus status = null;
        try {
            // 开启事务
            DefaultTransactionDefinition def = new DefaultTransactionDefinition();
            def.setPropagationBehavior(DefaultTransactionDefinition.PROPAGATION_REQUIRED);
            status = transactionManager.getTransaction(def);
            // 扣减库存 -乐观锁
            boolean success = seckillVoucherService.update().setSql("stock = stock - 1")
                    .eq("voucher_id", voucherOrder.getVoucherId())
                    .gt("stock", 0)
                    .update();
            if (!success) {
                transactionManager.rollback(status);
            }

            // 创建订单
            save(voucherOrder);

            // 提交事务
            transactionManager.commit(status);
        } catch (Exception e) {
            // 发生异常时回滚事务
            transactionManager.rollback(status);
            throw new RuntimeException(e);
        }
    }

    @Override
    public Result seckillVoucher(Long voucherId) throws InterruptedException {
        // 执行Lua脚本 进行资格判断并发送消息到消息队列
        long orderId = redisIdWorker.nextId("order");
        Long res = stringRedisTemplate.execute(SECKILL_SCRIPT, Collections.emptyList(),
                voucherId.toString(),
                UserHolder.getUser().getId().toString(),
                String.valueOf(orderId));
        if (res == 1) {
            return Result.fail("库存不足");
        }
        if (res == 2) {
            return Result.fail("请勿重复下单");
        }
        return Result.ok(orderId);
    }
```

# 点赞功能

**用 Redis 的 ZSet 存储“哪个用户点赞了哪篇博客”，并用时间戳作为分数。**

围绕这个核心，整个点赞功能只做三件事：

1. **判断是否点赞**：用 `ZSCORE` 查一下当前用户 ID 在不在 ZSet 里。存在就是已点赞。

```java
// 查询blog是否被点赞
            Double exist = stringRedisTemplate.opsForZSet().score(RedisConstants.BLOG_LIKED_KEY + blog.getId(), UserHolder.getUser().getId().toString());
            blog.setIsLike(exist != null);
```



2. **记录/取消点赞**：点赞就把用户 ID 加进去（`ZADD`），取消就移出来（`ZREM`）。同时顺手更新一下数据库里的点赞总数。

```java
// 判断当前用户是否点赞
        Long userId = UserHolder.getUser().getId();
        Double exist = stringRedisTemplate.opsForZSet().score(RedisConstants.BLOG_LIKED_KEY + id, userId.toString());
        if (exist != null) {
            // 已经点赞 取消点赞
            boolean success = update().setSql("liked = liked - 1").eq("id", id).update();
            if (success) {
                stringRedisTemplate.opsForZSet().remove(RedisConstants.BLOG_LIKED_KEY + id, userId.toString());
            }
            return Result.ok();
        }
        // 没有点赞 点赞
        boolean success = update().setSql("liked = liked + 1").eq("id", id).update();
        if (success) {
            stringRedisTemplate.opsForZSet().add(RedisConstants.BLOG_LIKED_KEY + id, userId.toString(), System.currentTimeMillis());
        }
        return Result.ok();
```

3. **查询点赞列表**：想知道谁点了赞，直接用 `ZRANGE` 从 ZSet 里按时间顺序取出来就行。但直接拿这批 ID 去 MySQL 做 `WHERE id IN (...)` 查询，返回结果的顺序是随机的，**顺序会丢失**。在 SQL 里手动追加 `ORDER BY FIELD(id, 1,2,3...)`，让 MySQL 按照我们给的 ID 列表的**原顺序**来返回用户数据。

```java
// 查询top5点赞用户
        Set<String> ids = stringRedisTemplate.opsForZSet().range(RedisConstants.BLOG_LIKED_KEY + id, 0L, 4L);
        if (ids == null || ids.isEmpty()) {
            return Result.ok(Collections.emptyList());
        }
        String idsStr = StrUtil.join(",", ids);
        List<User> users = userService.query().in("id", ids).last("order by field (id," + idsStr + ")").list();
        List<UserDTO> userDTOS = BeanUtil.copyToList(users, UserDTO.class);
        return Result.ok(userDTOS);
```

# 好友关注

## 关注

关注功能基于 **Redis Set** 实现高效查询，支持三个核心操作：

- **关注/取消关注**
- **判断是否关注**
- **查询共同关注**

**核心思想**：用 Redis Set 存储每个用户的“关注对象集合”，利用 Set 的 `SISMEMBER` 快速判断关注关系，利用 `SINTER` 高效计算共同关注。

1. ##### 关注 / 取关

**关注操作** (`isFollow = true`)：

- 构建 `Follow` 实体，写入数据库
- 写入成功后，将 `followUserId` 加入 Redis Set：
  `SADD follow_key:userId followUserId`

**取关操作** (`isFollow = false`)：

- 构造条件删除数据库记录
- 删除成功后，从 Redis Set 中移除：
  `SREM follow_key:userId followUserId`

> **注意**：数据库和 Redis 操作都进行了成功校验，先写 DB 再写 Redis，保证 DB 成功才写缓存。

```java
 @Override
    public Result follow(Long followUserId, Boolean isFollow) {
        Long userId = UserHolder.getUser().getId();
        if (BooleanUtil.isTrue(isFollow)) {
            // 关注
            Follow follow = Follow.builder()
                    .userId(userId)
                    .followUserId(followUserId)
                    .build();
            boolean success = save(follow);
            if (success) {
                stringRedisTemplate.opsForSet().add(RedisConstants.FOLLOW_KEY + userId, followUserId.toString());
            }
        } else {
            // 取关
            LambdaQueryWrapper<Follow> queryWrapper = new LambdaQueryWrapper<Follow>()
                    .eq(Follow::getUserId, userId)
                    .eq(Follow::getFollowUserId, followUserId);
            boolean success = remove(queryWrapper);
            if (success) {
                stringRedisTemplate.opsForSet().remove(RedisConstants.FOLLOW_KEY + userId, followUserId.toString());
            }
        }
        return Result.ok();
    }
```

2. ##### 判断是否关注

直接查询 Redis Set，不再走数据库：

```java
Boolean isMember = stringRedisTemplate.opsForSet()
    .isMember(FOLLOW_KEY + currentUserId, followUserId.toString());
```

3. ##### 查询共同关注

`SINTER` 在 Redis 服务端完成交集计算，时间复杂度 O(N*M) 但比在应用层循环判断更高效，且一次网络往返得出结果。

```java
Set<String> intersect = stringRedisTemplate.opsForSet()
    .intersect(FOLLOW_KEY + userId, FOLLOW_KEY + id);
```

## 关注推送-Feed流

Feed 流是社交产品中常见的“信息流”功能，用户关注的人发布了新内容，这些内容会推送到用户的“关注”页面，按时间或热度排序展示。

**核心问题**：如何高效地把“你关注的人”的最新内容分发给你？

| 模式               | 原理                                                         | 优点                                 | 缺点                                            | 使用场景              |
| :----------------- | :----------------------------------------------------------- | :----------------------------------- | :---------------------------------------------- | :-------------------- |
| **拉模式（Pull）** | 用户查看 Feed 时，实时查询所有关注对象的最新内容，排序后返回。 | 实现简单，内容实时性强，无额外存储。 | 关注数多时查询压力大，性能差。                  | 很少使用              |
| **推模式（Push）** | 发布内容时，立即写入所有粉丝的 Feed 收件箱（预生成）。       | 读取快，只需查自己的收件箱。         | 写扩散严重，大V发一条需写千万条，且存储成本高。 | 用户量少，没有大V     |
| **推拉结合**       | 活跃用户/大V使用拉模式，普通用户使用推模式，混合调度。       | 平衡读写性能与资源消耗。             | 系统复杂度较高。                                | 过千万的用户量，有大V |

### 基于推模式实现关注推送

采用**推模式**：用户发布新笔记时，立即将笔记 ID 推送到所有粉丝的“收件箱”中。查询 Feed 时只需读取自己的收件箱，无需实时查询关注对象的内容。

1. 推模式收件箱

- **数据结构**：每个用户一个 `ZSET`，key 是 `feed:userId`，member 是笔记 ID，score 是发布时间戳。
- **写扩散**：发布笔记时，查出所有粉丝，把笔记 ID 塞进每个粉丝的收件箱。**一条笔记，多份拷贝**。
- **读极简**：看动态时只查自己的收件箱，倒序取出一批即可，不用去关注列表里逐个拉取。

```java
    @Override
    public Result saveBlog(Blog blog) {
        // 获取登录用户
        UserDTO user = UserHolder.getUser();
        blog.setUserId(user.getId());
        // 保存探店博文
        boolean success = save(blog);
        if (!success) {
            return Result.fail("新增笔记失败");
        }
        // 查询笔记作者的所有粉丝
        LambdaQueryWrapper<Follow> queryWrapper = new LambdaQueryWrapper<Follow>().eq(Follow::getFollowUserId, user.getId());
        List<Long> followIds = followService.list(queryWrapper).stream().map(Follow::getUserId).collect(Collectors.toList());
        // 推送给粉丝收件箱
        if (followIds != null && !followIds.isEmpty()) {
            for (Long followId : followIds) {
                stringRedisTemplate.opsForZSet().add(RedisConstants.FEED_KEY + followId, blog.getId().toString(), System.currentTimeMillis());
            }
        }
        // 返回id
        return Result.ok(blog.getId());
    }
```

2. 滚动分页

- 不用传统 `limit offset`，而是用 **上一次返回的最小时间戳 `minTime`** 和 **同时间戳内已偏移量 `offset`** 作为游标。
- 每次查询 `ZREVRANGEBYSCORE` 带上 `max=上次的minTime`，并跳过 `offset` 个同分元素，保证数据连续不重不漏。
- 返回给客户端 （包含列表、下次的 `minTime`、`offset`），实现下拉刷新无缝衔接。

```java
    @Override
    public Result queryBlogOfFollow(Long max, Integer offset) {
        // 查询当前用户的收件箱
        Long userId = UserHolder.getUser().getId();
        Set<ZSetOperations.TypedTuple<String>> typedTuples = stringRedisTemplate.opsForZSet().reverseRangeByScoreWithScores(RedisConstants.FEED_KEY + userId, 0, max, offset, 2);
        if (typedTuples == null || typedTuples.isEmpty()) {
            return Result.ok();
        }
        List<Long> ids = new ArrayList<>(typedTuples.size());
        long minTime = System.currentTimeMillis();
        offset = 1;
        for (ZSetOperations.TypedTuple<String> tuple : typedTuples) {
            // 获取博客id
            String blogId = tuple.getValue();
            ids.add(Long.valueOf(blogId));
            long time = tuple.getScore().longValue();
            if (time == minTime) {
                offset++;
            } else {
                minTime = time;
                offset = 1;
            }
        }
        String idsStr = StrUtil.join(",", ids);
        List<Blog> blogs = query().in("id", ids).last("order by field(id," + idsStr + ")").list();
        for (Blog blog : blogs) {
            // 查询blog是否被点赞
            Double exist = stringRedisTemplate.opsForZSet().score(RedisConstants.BLOG_LIKED_KEY + blog.getId(), UserHolder.getUser().getId().toString());
            blog.setIsLike(exist != null);
        }
        return Result.ok(ScrollResult.builder().list(blogs).offset(offset).minTime(minTime).build());
    }
```

# 附近商铺

## GEO数据结构

GEO就是Geolocation的简写形式，代表地理坐标。Redis在3.2版本中加入了对GEO的支持，允许存储地理坐标信息，帮助我们根据经纬度来检索数据。常见的命令有：

**GEOADD**：添加一个地理空间信息，包含：经度（longitude）、纬度（latitude）、值（member）

**GEODIST**：计算指定的两个点之间的距离并返回

**GEOHASH**：将指定member的坐标转为hash字符串形式并返回

**GEOPOS**：返回指定member的坐标

**GEORADIUS**：指定圆心、半径，找到该圆内包含的所有member，并按照与圆心之间的距离排序后返回。6.2以后已废弃

**GEOSEARCH**：在指定范围内搜索member，并按照与指定点之间的距离排序后返回。范围可以是圆形或矩形。6.2.新功能

**GEOSEARCHSTORE**：与GEOSEARCH功能一致，不过可以把结果存储到一个指定的key。6.2.新功能

## 附近商铺实现

按照商户类型做分组，类型相同的商户作为同一组，以typeId为key存入同一个GEO集合中即可

| Key           | Value      | Score            |
| ------------- | ---------- | ---------------- |
| shop:geo:美食 | 海底捞火锅 | 4069152240174578 |
|               | 新白鹿     | 4069879450313142 |
| shop:geo:KTV  | KTV        | 4069885469876391 |
|               | KALEDI KTV | 4069885424176331 |

- 用 `GEOSEARCH` 以用户坐标画一个圆（如半径 5 公里），结果**自动按距离从近到远排好序**。
- Redis 不支持直接分页偏移，所以代码里一次性多取一些，再在应用层用 `skip` 截取当前页数据。

**注意**：这里先一次性取 `end` 条，再在应用层用 `skip(from)` 截取，因为 Redis GEO 的 `limit` 参数不支持 offset，只能指定返回数量上限。

- 最后根据返回的 ID 列表查数据库补全详细信息，并通过 `ORDER BY FIELD` 保持与 Redis 一致的距离顺序。

```java
    @Override
    public Result queryShopByType(Integer typeId, Integer current, Double x, Double y) {
        // 根据Redis GEO进行分页查询
        int from = (current - 1) * SystemConstants.DEFAULT_PAGE_SIZE;
        int end = current * SystemConstants.DEFAULT_PAGE_SIZE;
        GeoResults<RedisGeoCommands.GeoLocation<String>> geoResults = stringRedisTemplate.opsForGeo()
                .search(RedisConstants.SHOP_GEO_KEY + typeId, GeoReference.fromCoordinate(x, y),
                        new Distance(5000, RedisGeoCommands.DistanceUnit.METERS),
                        RedisGeoCommands.GeoSearchCommandArgs.newGeoSearchArgs().limit(end).includeDistance());
        if (geoResults == null || geoResults.getContent().size() <= from) {
            return Result.ok(Collections.emptyList());
        }
        // 解析商铺id
        List<Long> ids = new ArrayList<>(geoResults.getContent().size());
        Map<String, Distance> distanceMap = new HashMap<>(geoResults.getContent().size());
        geoResults.getContent().stream()
                .skip(from).forEach(geoResult -> {
                    String shopIdStr = geoResult.getContent().getName();
                    ids.add(Long.valueOf(shopIdStr));
                    Distance distance = geoResult.getDistance();
                    distanceMap.put(shopIdStr, distance);
                });
        // 根据id查询
        String idStr = StrUtil.join(",", ids);
        List<Shop> shops = query().in("id", ids).last("ORDER BY FIELD(id," + idStr + ")").list();
        for (Shop shop : shops) {
            shop.setDistance(distanceMap.get(shop.getId().toString()).getValue());
        }
        return Result.ok(shops);
    }
```

# 用户签到

## BitMap数据结构

Redis中是利用string类型数据结构实现BitMap，因此最大上限是512M，转换为bit则是 $2^{32}$个bit位。

BitMap的操作命令有：

**SETBIT**：向指定位置（offset）存入一个0或1

**GETBIT**：获取指定位置（offset）的bit值

**BITCOUNT**：统计BitMap中值为1的bit位的数量

**BITFIELD**：操作（查询、修改、自增）BitMap中bit数组中的指定位置（offset）的值

**BITFIELD_RO**：获取BitMap中bit数组，并以十进制形式返回

**BITOP**：将多个BitMap的结果做位运算（与 、或、异或）

**BITPOS**：查找bit数组中指定范围内第一个0或1出现的位置

## 用户签到实现

### 签到

- 每个用户每月一个 Key，用二进制位表示当月每一天是否签到。
- 第 1 天对应第 0 位，第 n 天对应第 (n-1) 位。
- 签到就是 `SETBIT key (day-1) 1`，天然幂等，占用空间极小。

```java
    @Override
    public Result sign() {
        // 获取当前用户
        Long userId = UserHolder.getUser().getId();
        // 获取当前时间
        LocalDateTime now = LocalDateTime.now();
        String yearMonth = now.format(DateTimeFormatter.ofPattern("yyyyMM"));
        // 获取今天是本月的第几天
        int day = now.getDayOfMonth();
        // 向Redis中写入数据
        String key = RedisConstants.USER_SIGN_KEY + userId + ":" + yearMonth;
        stringRedisTemplate.opsForValue().setBit(key, day - 1, true);
        return Result.ok();
    }
```

### 统计连续签到

- 用 `BITFIELD` 命令一次性取出截止到今天的所有位，得到一个整数（低位代表第 1 天，高位代表今天）。
- 然后从今天（最低位）开始逐位检查：
  `(number & 1) == 1` 表示今天签到，计数 +1，再 `>>> 1` 检查前一天，直到遇到 0 停止。
- 这样就能快速算出**包含今天的连续签到天数**，无需逐天查 Redis。

```java
    @Override
    public Result signCount() {
        // 获取当前用户
        Long userId = UserHolder.getUser().getId();
        // 获取当前时间
        LocalDateTime now = LocalDateTime.now();
        String yearMonth = now.format(DateTimeFormatter.ofPattern("yyyyMM"));
        // 获取今天是本月的第几天
        int day = now.getDayOfMonth();
        // 获取本月截止至今天的所有签到记录
        String key = RedisConstants.USER_SIGN_KEY + userId + ":" + yearMonth;
        List<Long> result = stringRedisTemplate.opsForValue().bitField(key, BitFieldSubCommands.create()
                .get(BitFieldSubCommands.BitFieldType.unsigned(day))
                .valueAt(0));
        if (result == null || result.isEmpty()) {
            return Result.ok(0);
        }
        Long number = result.get(0);
        if (number == null || number == 0) {
            return Result.ok(0);
        }
        int count = 0;
        while (true) {
            if ((number & 1) == 0) {
                // 说明当前未签到
                break;
            } else {
                // 签到计数器加一
                count++;
            }
            // 签到状态右移一位 抛弃最后一个比特位
            number >>>= 1;
        }
        return Result.ok(count);
    }
```

# UV统计

-  **UV**：全称Unique Visitor，也叫独立访客量，是指通过互联网访问、浏览这个网页的自然人。1天内同一个用户多次访问该网站，只记录1次。

-  **PV**：全称Page View，也叫页面访问量或点击量，用户每访问网站的一个页面，记录1次PV，用户多次打开页面，则记录多次PV。往往用来衡量网站的流量。

Hyperloglog(HLL)是从Loglog算法派生的概率算法，用于确定非常大的集合的基数，而不需要存储其所有值。相关算法原理可以参考：https://juejin.cn/post/6844903785744056333#heading-0

Redis中的HLL是基于string结构实现的，单个HLL的内存永远小于16kb，内存占用低的令人发指！作为代价，其测量结果是概率性的，有小于0.81%的误差。不过对于UV统计来说，这完全可以忽略。

> **用途**：UV 统计、大规模去重计数（误差 <0.81%，占用 <16KB）。

| 命令        | 语法示例                            | 说明                                    |
| ----------- | ----------------------------------- | --------------------------------------- |
| **PFADD**   | `PFADD uv:20240605 user1 user2`     | 添加元素到 HLL 中（重复元素不计数）。   |
| **PFCOUNT** | `PFCOUNT uv:20240605`               | 返回近似基数（去重后的数量）。          |
| **PFMERGE** | `PFMERGE uv:week uv:01 uv:02 uv:03` | 合并多个 HLL 为一个，用于统计累计数据。 |

```java
    @Test
    void testHyperLogLog() {
        String[] values = new String[1000];
        int j = 0;
        for (int i = 0; i < 10000 * 100; i++) {
            j = i % 1000;
            values[j] = "user_" + i;
            if (j == 999) {
                // 添加到redis
                stringRedisTemplate.opsForHyperLogLog().add("hl1", values);
            }
        }
        // 统计数量
        Long count = stringRedisTemplate.opsForHyperLogLog().size("hl1");
        System.out.println(count);
    }
```

