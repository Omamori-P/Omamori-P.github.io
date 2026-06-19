---
title: Elasticsearch
date: 2024-06-10 20:11:14
tags:
  - 中间件
  - 搜索引擎
categories:
  - 中间件
  - 搜索引擎
---
# 初识elasticsearch

[Elasticsearch](https://www.elastic.co/cn/elasticsearch/)是由elastic公司开发的一套搜索引擎技术，它是elastic技术栈中的一部分。完整的技术栈包括：

- Elasticsearch：用于数据存储、计算和搜索
- Logstash/Beats：用于数据收集
- Kibana：用于数据可视化

整套技术栈被称为ELK，经常用来做日志收集、系统监控和状态分析等等。

首先Elasticsearch不用多说，是提供核心的数据存储、搜索、分析功能的。

然后是Kibana，Elasticsearch对外提供的是Restful风格的API，任何操作都可以通过发送http请求来完成。不过http请求的方式、路径、还有请求参数的格式都有严格的规范。这些规范我们肯定记不住，因此我们要借助于Kibana这个服务。

Kibana是elastic公司提供的用于操作Elasticsearch的可视化控制台。它的功能非常强大，包括：

- 对Elasticsearch数据的搜索、展示
- 对Elasticsearch数据的统计、聚合，并形成图形化报表、图形
- 对Elasticsearch的集群状态监控
- 它还提供了一个开发控制台（DevTools），在其中对Elasticsearch的Restful的API接口提供了**语法提示**

## 安装

### Elasticsearch

通过下面的Docker命令即可安装单机版本的elasticsearch，安装完成后，访问9200端口，即可看到响应的Elasticsearch服务的基本信息：：

```Bash
docker run -d \
  --name es \
  -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  -e "discovery.type=single-node" \
  -v es-data:/usr/share/elasticsearch/data \
  -v es-plugins:/usr/share/elasticsearch/plugins \
  --privileged \
  --network es-net \
  -p 9200:9200 \
  -p 9300:9300 \
  elasticsearch:7.12.1
```

注意，这里我们采用的是elasticsearch的7.12.1版本，由于8以上版本的JavaAPI变化很大，在企业中应用并不广泛，企业中应用较多的还是8以下的版本。

### Kibana

通过下面的Docker命令，即可部署Kibana，安装完成后，直接访问5601端口，即可看到控制台页面：

```Bash
docker run -d \
--name kibana \
-e ELASTICSEARCH_HOSTS=http://es:9200 \
--network=es-net \
-p 5601:5601  \
kibana:7.12.1
```

### IK分词器

Elasticsearch的关键就是倒排索引，而倒排索引依赖于对文档内容的分词，而分词则需要高效、精准的分词算法。标准分词器智能1字1词条，无法正确对中文做分词。[IK分词器](https://github.com/infinilabs/analysis-ik)就是专门针对中文的分词算法。

#### 安装IK分词器

**方案一**：在线安装

运行一个命令即可：

```Shell
docker exec -it es ./bin/elasticsearch-plugin  install https://github.com/medcl/elasticsearch-analysis-ik/releases/download/v7.12.1/elasticsearch-analysis-ik-7.12.1.zip
```

然后重启es容器：

```Shell
docker restart es
```

**方案二**：离线安装

如果网速较差，也可以选择离线安装。

首先，查看之前安装的Elasticsearch容器的plugins数据卷目录：

```Shell
docker volume inspect es-plugins
```

结果如下：

```JSON
[
    {
        "CreatedAt": "2024-11-06T10:06:34+08:00",
        "Driver": "local",
        "Labels": null,
        "Mountpoint": "/var/lib/docker/volumes/es-plugins/_data",
        "Name": "es-plugins",
        "Options": null,
        "Scope": "local"
    }
]
```

可以看到elasticsearch的插件挂载到了`/var/lib/docker/volumes/es-plugins/_data`这个目录。我们需要把IK分词器上传至这个目录。

最后，重启es容器：

```Shell
docker restart es
```

#### 使用IK分词器

IK分词器包含两种模式：

-  `ik_smart`：智能语义切分 
-  `ik_max_word`：最细粒度切分 

| **模式**        | **特点**                                                   | **场景**                                               |
| :-------------- | :--------------------------------------------------------- | :----------------------------------------------------- |
| **ik_max_word** | **穷举式拆分**。会输出所有可能的词语（包括交叉重叠的词）。 | **建索引**时常用（提高召回率，让用户搜小词也能搜到）。 |
| **ik_smart**    | **智能去重**。只保留最符合语义的切分，去除歧义和冗余。     | **搜索查询**时常用（提高准确率，避免搜出无关内容）。   |

------

**举个极简例子：**

> 文本：**“华南师范大学人工智能”**

- `ik_max_word`结果：`华南师范大学`、`华南`、`南师`、`师范大学`、`师范`、`大学`...
- `ik_smart`结果：`华南师范大学`、`人工智能`

#### 拓展词典

随着互联网的发展，“造词运动”也越发的频繁。出现了很多新的词语，在原有的词汇列表中并不存在。比如：“泰裤辣”，“传智播客” 等。IK分词器无法对这些词汇分词，那么就需要使用扩展词典。

打开IK分词器config目录，在IKAnalyzer.cfg.xml配置文件内容添加：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE properties SYSTEM "http://java.sun.com/dtd/properties.dtd">
<properties>
	<comment>IK Analyzer 扩展配置</comment>
	<!--用户可以在这里配置自己的扩展字典 -->
	<entry key="ext_dict">ext.dic</entry>
	 <!--用户可以在这里配置自己的扩展停止词字典-->
	<entry key="ext_stopwords"></entry>
	<!--用户可以在这里配置远程扩展字典 -->
	<!-- <entry key="remote_ext_dict">words_location</entry> -->
	<!--用户可以在这里配置远程扩展停止词字典-->
	<!-- <entry key="remote_ext_stopwords">words_location</entry> -->
</properties>
```

在IK分词器的config目录新建一个 `ext.dic`，可以参考config目录下复制一个配置文件进行修改

```Plain
传智播客
泰裤辣
```

重启elasticsearch

```Shell
docker restart es
```

#### 停用词典

使用停用词的核心目的，是为了**提升搜索的精准度与性能，过滤掉那些高频但无实际检索价值的词汇**。

- **如果不加过滤**：用户搜索“**的**时候”，可能会匹配到所有包含“的”字的文档，导致搜索结果泛滥，真正的目标文档反而被淹没。
- **过滤之后**：系统会忽略“的”，只匹配“时候”，结果更加精准。比如搜索“**这是**一本书”，系统实际只搜索“**书**”，能直接命中用户真正的意图。

配置 IK 分词器的停用词词典，与配置扩展词典的步骤几乎完全一致，只需在 `IKAnalyzer.cfg.xml` 中启用 `ext_stopwords` 条目，并创建对应的字典文件即可。

## 索引

elasticsearch之所以有如此高性能的搜索表现，正是得益于底层的倒排索引技术。那么什么是倒排索引呢？

**倒排**索引的概念是基于MySQL这样的**正向**索引而言的。

-  **正向索引**是最传统的，根据id索引的方式。但根据词条查询时，必须先逐条获取每个文档，然后判断文档中是否包含所需要的词条，是**根据文档找词条的过程**。 
-  而**倒排索引**则相反，是先找到用户要搜索的词条，根据词条得到保护词条的文档的id，然后根据id获取文档。是**根据词条找文档的过程**。 

### 正向索引

例如有一张名为`tb_goods`的表：

| **id** | **title**      | **price** |
| :----- | :------------- | :-------- |
| 1      | 小米手机       | 3499      |
| 2      | 华为手机       | 4999      |
| 3      | 华为小米充电器 | 49        |
| 4      | 小米手环       | 49        |
| ...    | ...            | ...       |

其中的`id`字段已经创建了索引，由于索引底层采用了B+树结构，因此我们根据id搜索的速度会非常快。但是其他字段例如`title`，只在叶子节点上存在。

因此要根据`title`搜索的时候只能遍历树中的每一个叶子节点，判断title数据是否符合要求。

比如用户的SQL语句为：

```SQL
select * from tb_goods where title like '%手机%';
```

那搜索的大概流程如图：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-17-image-20260617203655462.webp" alt="image" width="100%"> </div>

说明：

- 1）检查到搜索条件为`like '%手机%'`，需要找到`title`中包含`手机`的数据
- 2）逐条遍历每行数据（每个叶子节点），比如第1次拿到`id`为1的数据
- 3）判断数据中的`title`字段值是否符合条件
- 4）如果符合则放入结果集，不符合则丢弃
- 5）回到步骤1

综上，根据id精确匹配时，可以走索引，查询效率较高。而当搜索条件为模糊匹配时，由于索引无法生效，导致从索引查询退化为全表扫描，效率很差。

因此，正向索引适合于根据索引字段的精确搜索，不适合基于部分词条的模糊匹配。

而倒排索引恰好解决的就是根据部分词条模糊匹配的问题。

### 倒排索引

倒排索引中有两个非常重要的概念：

- 文档（`Document`）：用来搜索的数据，其中的每一条数据就是一个文档。例如一个网页、一个商品信息
- 词条（`Term`）：对文档数据或用户搜索数据，利用某种算法分词，得到的具备含义的词语就是词条。例如：我是中国人，就可以分为：我、是、中国人、中国、国人这样的几个词条

**创建倒排索引**是对正向索引的一种特殊处理和应用，流程如下：

- 将每一个文档的数据利用**分词算法**根据语义拆分，得到一个个词条
- 创建表，每行数据包括词条、词条所在文档id、位置等信息
- 因为词条唯一性，可以给词条创建**正向**索引

此时形成的这张以词条为索引的表，就是倒排索引表，两者对比如下：

**正向索引**

| **id（索引）** | **title**      | **price** |
| :------------- | :------------- | :-------- |
| 1              | 小米手机       | 3499      |
| 2              | 华为手机       | 4999      |
| 3              | 华为小米充电器 | 49        |
| 4              | 小米手环       | 49        |
| ...            | ...            | ...       |

**倒排索引**

| **词条（索引）** | **文档id** |
| :--------------- | :--------- |
| 小米             | 1，3，4    |
| 手机             | 1，2       |
| 华为             | 2，3       |
| 充电器           | 3          |
| 手环             | 4          |

倒排索引的**搜索流程**如下（以搜索"华为手机"为例），如图：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-17-image-20260617203813521.webp" alt="image" width="100%"> </div>

流程描述：

1）用户输入条件`"华为手机"`进行搜索。

2）对用户输入条件**分词**，得到词条：`华为`、`手机`。

3）拿着词条在倒排索引中查找（**由于词条有****索引****，查询效率很高**），即可得到包含词条的文档id：`1、2、3`。

4）拿着文档`id`到正向索引中查找具体文档即可（由于`id`也有索引，查询效率也很高）。

虽然要先查询倒排索引，再查询倒排索引，但是无论是词条、还是文档id都建立了索引，查询速度非常快！无需全表扫描。

## 基础概念

### 文档和字段

elasticsearch是面向**文档（Document）**存储的，可以是数据库中的一条商品数据，一个订单信息。文档数据会被序列化为`json`格式后存储在`elasticsearch`中：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-17-image-20260617204456475.webp" alt="image" width="100%"> </div>

因此，原本数据库中的一行数据就是ES中的一个JSON文档；而数据库中每行数据都包含很多列，这些列就转换为JSON文档中的**字段（Field）**。

### 索引和映射

随着业务发展，需要在es中存储的文档也会越来越多，比如有商品的文档、用户的文档、订单文档等等：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-17-image-20260617204543112.webp" alt="image" width="100%"> </div>

所有文档都散乱存放显然非常混乱，也不方便管理。

因此，我们要将类型相同的文档集中在一起管理，称为**索引（Index）**。例如：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-17-image-20260617204611259.webp" alt="image" width="100%"> </div>

- 所有用户文档，就可以组织在一起，称为用户的索引；
- 所有商品的文档，可以组织在一起，称为商品的索引；
- 所有订单的文档，可以组织在一起，称为订单的索引；

因此，我们可以把索引当做是数据库中的表。

数据库的表会有约束信息，用来定义表的结构、字段的名称、类型等信息。因此，索引库中就有**映射（mapping）**，是索引中文档的字段约束信息，类似表的结构约束。

### MySQL与Elasticsearch

我们统一的把mysql与elasticsearch的概念做一下对比：

| **MySQL** | **Elasticsearch** | **说明**                                                     |
| :-------- | :---------------- | :----------------------------------------------------------- |
| Table     | Index             | 索引(index)，就是文档的集合，类似数据库的表(table)           |
| Row       | Document          | 文档（Document），就是一条条的数据，类似数据库中的行（Row），文档都是JSON格式 |
| Column    | Field             | 字段（Field），就是JSON文档中的字段，类似数据库中的列（Column） |
| Schema    | Mapping           | Mapping（映射）是索引中文档的约束，例如字段类型约束。类似数据库的表结构（Schema） |
| SQL       | DSL               | DSL是elasticsearch提供的JSON风格的请求语句，用来操作elasticsearch，实现CRUD |

-  Mysql：擅长事务类型操作，可以确保数据的安全和一致性 
-  Elasticsearch：擅长海量数据的搜索、分析、计算 

因此在企业中，往往是两者结合使用：

- 对安全性要求较高的写操作，使用mysql实现
- 对查询性能要求较高的搜索需求，使用elasticsearch实现
- 两者再基于某种方式，实现数据的同步，保证一致性

# DSL

[Elasticsearch Guide](https://www.elastic.co/guide/en/elasticsearch/reference/7.12/index.html)

## 索引库操作

Index就类似数据库表，Mapping映射就类似表的结构。我们要向es中存储数据，必须先创建Index和Mapping

### Mapping映射属性

Mapping是对索引库中文档的约束，常见的Mapping属性包括：

- `type`：字段数据类型，常见的简单类型有： 
  - 字符串：`text`（可分词的文本）、`keyword`（精确值，例如：品牌、国家、ip地址）
  - 数值：`long`、`integer`、`short`、`byte`、`double`、`float`、
  - 布尔：`boolean`
  - 日期：`date`
  - 对象：`object`
- `index`：是否创建索引，默认为`true`
- `analyzer`：使用哪种分词器
- `properties`：该字段的子字段

例如下面的json文档：

```JSON
{
    "age": 21,
    "weight": 52.1,
    "isMarried": false,
    "info": "黑马程序员Java讲师",
    "email": "zy@itcast.cn",
    "score": [99.1, 99.5, 98.9],
    "name": {
        "firstName": "云",
        "lastName": "赵"
    }
}
```

对应的每个字段映射（Mapping）：

{% raw %}
<table style="border-collapse: collapse; width: 100%; margin: 1em 0;">
  <thead>
    <tr>
      <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;">字段名</th>
      <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;">字段类型</th>
      <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;">类型说明</th>
      <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; text-align: center;">是否参与搜索</th>
      <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5; text-align: center;">是否参与分词</th>
      <th style="border: 1px solid #ddd; padding: 8px; background: #f5f5f5;">分词器</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">age</td>
      <td style="border: 1px solid #ddd; padding: 8px;">integer</td>
      <td style="border: 1px solid #ddd; padding: 8px;">整数</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☑</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☐</td>
      <td style="border: 1px solid #ddd; padding: 8px;">—</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">weight</td>
      <td style="border: 1px solid #ddd; padding: 8px;">float</td>
      <td style="border: 1px solid #ddd; padding: 8px;">浮点数</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☑</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☐</td>
      <td style="border: 1px solid #ddd; padding: 8px;">—</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">isMarried</td>
      <td style="border: 1px solid #ddd; padding: 8px;">boolean</td>
      <td style="border: 1px solid #ddd; padding: 8px;">布尔</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☑</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☐</td>
      <td style="border: 1px solid #ddd; padding: 8px;">—</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">info</td>
      <td style="border: 1px solid #ddd; padding: 8px;">text</td>
      <td style="border: 1px solid #ddd; padding: 8px;">字符串，但需要分词</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☑</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☑</td>
      <td style="border: 1px solid #ddd; padding: 8px;">IK</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">email</td>
      <td style="border: 1px solid #ddd; padding: 8px;">keyword</td>
      <td style="border: 1px solid #ddd; padding: 8px;">字符串，但是不分词</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☐</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☐</td>
      <td style="border: 1px solid #ddd; padding: 8px;">—</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">score</td>
      <td style="border: 1px solid #ddd; padding: 8px;">float</td>
      <td style="border: 1px solid #ddd; padding: 8px;">只看数组中元素类型</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☑</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☐</td>
      <td style="border: 1px solid #ddd; padding: 8px;">—</td>
    </tr>
    <!-- name字段跨2行 -->
    <tr>
      <td rowspan="2" style="border: 1px solid #ddd; padding: 8px;">name</td>
      <td style="border: 1px solid #ddd; padding: 8px;">firstName</td>
      <td style="border: 1px solid #ddd; padding: 8px;">字符串，但是不分词</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☑</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☐</td>
      <td style="border: 1px solid #ddd; padding: 8px;">—</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px;">lastName</td>
      <td style="border: 1px solid #ddd; padding: 8px;">字符串，但是不分词</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☑</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">☐</td>
      <td style="border: 1px solid #ddd; padding: 8px;">—</td>
    </tr>
  </tbody>
</table>
{% endraw %}

### 索引库的CRUD

由于Elasticsearch采用的是Restful风格的API，因此其请求方式和路径相对都比较规范，而且请求参数也都采用JSON风格。

我们直接基于Kibana的DevTools来编写请求做测试，由于有语法提示，会非常方便。

#### 创建索引库和映射

**基本语法**：

- 请求方式：`PUT`
- 请求路径：`/索引库名`，可以自定义
- 请求参数：`mapping`映射

**格式**：

```JSON
PUT /索引库名称
{
  "mappings": {
    "properties": {
      "字段名":{
        "type": "text",
        "analyzer": "ik_smart"
      },
      "字段名2":{
        "type": "keyword",
        "index": "false"
      },
      "字段名3":{
        "properties": {
          "子字段": {
            "type": "keyword"
          }
        }
      },
      // ...略
    }
  }
}
```

**示例**：

```JSON
# PUT /heima
{
  "mappings": {
    "properties": {
      "info":{
        "type": "text",
        "analyzer": "ik_smart"
      },
      "email":{
        "type": "keyword",
        "index": "false"
      },
      "name":{
        "properties": {
          "firstName": {
            "type": "keyword"
          }
        }
      }
    }
  }
}
```

#### 查询索引库

**基本语法**：

-  请求方式：GET 
-  请求路径：/索引库名 
-  请求参数：无 

**格式**：

```Plain
GET /索引库名
```

**示例**：

```Plain
GET /heima
```

#### 修改索引库

倒排索引结构虽然不复杂，但是一旦数据结构改变（比如改变了分词器），就需要重新创建倒排索引，这简直是灾难。因此索引库**一旦创建，无法修改mapping**。

虽然无法修改mapping中已有的字段，但是却允许添加新的字段到mapping中，因为不会对倒排索引产生影响。因此修改索引库能做的就是向索引库中添加新字段，或者更新索引库的基础属性。

**语法说明**：

```JSON
PUT /索引库名/_mapping
{
  "properties": {
    "新字段名":{
      "type": "integer"
    }
  }
}
```

**示例**：

```JSON
PUT /heima/_mapping
{
  "properties": {
    "age":{
      "type": "integer"
    }
  }
}
```

#### 删除索引库

**语法：**

-  请求方式：DELETE 
-  请求路径：/索引库名 
-  请求参数：无 

**格式：**

```Plain
DELETE /索引库名
```

示例：

```Plain
DELETE /heima
```

## 文档操作

有了索引库，接下来就可以向索引库中添加数据了。

Elasticsearch中的数据其实就是JSON风格的文档。操作文档自然保护`增`、`删`、`改`、`查`等几种常见操作。

### 新增文档

**语法：**

```JSON
POST /索引库名/_doc/文档id
{
    "字段1": "值1",
    "字段2": "值2",
    "字段3": {
        "子属性1": "值3",
        "子属性2": "值4"
    },
}
```

**示例：**

```JSON
POST /heima/_doc/1
{
    "info": "黑马程序员Java讲师",
    "email": "zy@itcast.cn",
    "name": {
        "firstName": "云",
        "lastName": "赵"
    }
}
```

### 查询文档

根据rest风格，新增是post，查询应该是get，不过查询一般都需要条件，这里我们把文档id带上。

**语法：**

```JSON
GET /{索引库名称}/_doc/{id}
```

**示例：**

```JavaScript
GET /heima/_doc/1
```

### 删除文档

删除使用DELETE请求，同样，需要根据id进行删除：

**语法：**

```JavaScript
DELETE /{索引库名}/_doc/id值
```

**示例：**

```JSON
DELETE /heima/_doc/1
```

### 修改文档

修改有两种方式：

- 全量修改：直接覆盖原来的文档
- 局部修改：修改文档中的部分字段

#### 全量修改

全量修改是覆盖原来的文档，其本质是两步操作：

- 根据指定的id删除文档
- 新增一个相同id的文档

> **注意**：如果根据id删除时，id不存在，第二步的新增也会执行，也就从修改变成了新增操作了。

**语法：**

```JSON
PUT /{索引库名}/_doc/文档id
{
    "字段1": "值1",
    "字段2": "值2",
    // ... 略
}
```

**示例：**

```JSON
PUT /heima/_doc/1
{
    "info": "黑马程序员高级Java讲师",
    "email": "zy@itcast.cn",
    "name": {
        "firstName": "云",
        "lastName": "赵"
    }
}
```

#### 局部修改

局部修改是只修改指定id匹配的文档中的部分字段。

**语法：**

```JSON
POST /{索引库名}/_update/文档id
{
    "doc": {
         "字段名": "新的值",
    }
}
```

**示例：**

```JSON
POST /heima/_update/1
{
  "doc": {
    "email": "ZhaoYun@itcast.cn"
  }
}
```

### 批处理

批处理采用POST请求，基本语法如下：

```Java
POST _bulk
{ "index" : { "_index" : "test", "_id" : "1" } }
{ "field1" : "value1" }
{ "delete" : { "_index" : "test", "_id" : "2" } }
{ "create" : { "_index" : "test", "_id" : "3" } }
{ "field1" : "value3" }
{ "update" : {"_id" : "1", "_index" : "test"} }
{ "doc" : {"field2" : "value2"} }
```

其中：

- `index`代表新增操作
  - `_index`：指定索引库名
  - `_id`指定要操作的文档id
  - `{ "field1" : "value1" }`：则是要新增的文档内容
- `delete`代表删除操作
  - `_index`：指定索引库名
  - `_id`指定要操作的文档id
- `update`代表更新操作
  - `_index`：指定索引库名
  - `_id`指定要操作的文档id
  - `{ "doc" : {"field2" : "value2"} }`：要更新的文档字段

示例，批量新增：

```Java
POST /_bulk
{"index": {"_index":"heima", "_id": "3"}}
{"info": "黑马程序员C++讲师", "email": "ww@itcast.cn", "name":{"firstName": "五", "lastName":"王"}}
{"index": {"_index":"heima", "_id": "4"}}
{"info": "黑马程序员前端讲师", "email": "zhangsan@itcast.cn", "name":{"firstName": "三", "lastName":"张"}}
```

批量删除：

```Java
POST /_bulk
{"delete":{"_index":"heima", "_id": "3"}}
{"delete":{"_index":"heima", "_id": "4"}}
```

## 查询

Elasticsearch的查询可以分为两大类：

- **叶子查询（Leaf** **query** **clauses）**：一般是在特定的字段里查询特定值，属于简单查询，很少单独使用。
- **复合查询（Compound** **query** **clauses）**：以逻辑方式组合多个叶子查询或者更改叶子查询的行为方式。

首先来看查询的语法结构：

```JSON
GET /{索引库名}/_search
{
  "query": {
    "查询类型": {
      // .. 查询条件
    }
  }
}
```

说明：

- `GET /{索引库名}/_search`：其中的`_search`是固定路径，不能修改

### 叶子查询

这里列举一些常见的，例如：

- **全文检索查询（Full Text Queries）**：利用分词器对用户输入搜索条件先分词，得到词条，然后再利用倒排索引搜索词条。例如：
  - `match`：
  - `multi_match`
- **精确查询（****Term-level queries****）**：不对用户输入搜索条件分词，根据字段内容精确值匹配。但只能查找keyword、数值、日期、boolean类型的字段。例如：
  - `ids`
  - `term`
  - `range`
- **地理坐标查询****：**用于搜索地理位置，搜索方式很多，例如：
  - `geo_bounding_box`：按矩形搜索
  - `geo_distance`：按点和半径搜索
- ...略

#### 全文检索查询

全文检索查询，会对用户输入内容分词，常用于搜索框搜索。全文检索的种类也很多，详情可以参考[官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/7.12/full-text-queries.html)：

以全文检索中的`match`为例，语法如下：

```JSON
GET /{索引库名}/_search
{
  "query": {
    "match": {
      "字段名": "搜索条件"
    }
  }
}
```

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618134803782.webp" alt="image" width="100%"> </div>

与`match`类似的还有`multi_match`，区别在于可以同时对多个字段搜索，而且多个字段都要满足，语法示例：

```JSON
GET /{索引库名}/_search
{
  "query": {
    "multi_match": {
      "query": "搜索条件",
      "fields": ["字段1", "字段2"]
    }
  }
}
```

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618134947124.webp" alt="image" width="100%"> </div>

#### 精确查询

精确查询，英文是`Term-level query`，顾名思义，词条级别的查询。也就是说不会对用户输入的搜索条件再分词，而是作为一个词条，与搜索的字段内容精确值匹配。因此推荐查找`keyword`、数值、日期、`boolean`类型的字段。例如：

- id
- price
- 城市
- 地名
- 人名
- 等等，作为一个整体才有含义的字段。

精确查询常见查询如下：

**term**：根据词条精确值查询

**range**：根据值的范围查询

以`term`查询为例，其语法如下：

```JSON
GET /{索引库名}/_search
{
  "query": {
    "term": {
      "字段名": {
        "value": "搜索条件"
      }
    }
  }
}
```

再来看下`range`查询，语法如下：

```JSON
GET /{索引库名}/_search
{
  "query": {
    "range": {
      "字段名": {
        "gte": {最小值},
        "lte": {最大值}
      }
    }
  }
}
```

`range`是范围查询，对于范围筛选的关键字有：

- `gte`：大于等于
- `gt`：大于
- `lte`：小于等于
- `lt`：小于

#### 地理查询

在使用地理查询之前，**字段必须先正确映射类型**，ES 不支持对普通 text/keyword 做地理运算。

| 类型            | 含义                            | 典型场景                           |
| --------------- | ------------------------------- | ---------------------------------- |
| **`geo_point`** | 一个经纬度点（Lat/Lon）         | 外卖门店坐标、"我附近 3km 的商家"  |
| **`geo_shape`** | 复杂几何图形（线、多边形、面…） | 行政区划边界、商圈围栏、配送范围面 |

**geo_bounding_box**：查询geo_point值落在某个矩形范围的所有文档

```json
GET /indexName/_search
{
  "query": {
    "geo_bounding_box": {
      "FIELD": {
        "top_left": {
          "lat": 31.1,
          "lon": 121.5
        },
        "bottom_right": {
          "lat": 30.9,
          "lon": 121.7
        }
      }
    }
  }
}
```

**geo_distance**：查询到指定中心点小于某个距离值的所有文档

```json
GET /indexName/_search
{
  "query": {
    "geo_distance": {
      "distance": "15km",
      "FIELD": "31.21,121.5"
    }
  }
}
```

### 复合查询

#### 算分函数查询

当我们利用match查询时，文档结果会根据与搜索词条的**关联度打分**（**_score**），返回结果时按照分值降序排列。

从elasticsearch5.1开始，采用的相关性打分算法是BM25算法，会随着词频增加而增大，但增长曲线会趋于水平。在elasticsearch5.0之前，TF-IDF打分算法会随着词频增加而越来越大。

要想人为控制相关性算分，就需要利用Elasticsearch中的function score 查询了。

function score 查询中包含四部分内容：

- **原始查询**条件：query部分，基于这个条件搜索文档，并且基于BM25算法给文档打分，**原始算分**（query score)
- **过滤条件**：filter部分，符合该条件的文档才会重新算分
- **算分函数**：符合filter条件的文档要根据这个函数做运算，得到的**函数算分**（function score），有四种函数 
  - weight：函数结果是常量
  - field_value_factor：以文档中的某个字段值作为函数结果
  - random_score：以随机数作为函数结果
  - script_score：自定义算分函数算法
- **运算模式**：算分函数的结果、原始查询的相关性算分，两者之间的运算方式，包括： 
  - multiply：相乘
  - replace：用function score替换query score
  - 其它，例如：sum、avg、max、min

function score的运行流程如下：

- 1）根据**原始条件**查询搜索文档，并且计算相关性算分，称为**原始算分**（query score）
- 2）根据**过滤条件**，过滤文档
- 3）符合**过滤条件**的文档，基于**算分函数**运算，得到**函数算分**（function score）
- 4）将**原始算分**（query score）和**函数算分**（function score）基于**运算模式**做运算，得到最终结果，作为相关性算分。

因此，其中的关键点是：

- 过滤条件：决定哪些文档的算分被修改
- 算分函数：决定函数算分的算法
- 运算模式：决定最终算分结果

示例：给IPhone这个品牌的手机算分提高十倍，分析如下：

- 过滤条件：品牌必须为IPhone
- 算分函数：常量weight，值为10
- 算分模式：相乘multiply

对应代码如下：

```JSON
GET /hotel/_search
{
  "query": {
    "function_score": {
      "query": {  .... }, // 原始查询，可以是任意条件
      "functions": [ // 算分函数
        {
          "filter": { // 满足的条件，品牌必须是Iphone
            "term": {
              "brand": "Iphone"
            }
          },
          "weight": 10 // 算分权重为10
        }
      ],
      "boost_mode": "multipy" // 加权模式，求乘积
    }
  }
}
```

#### Boolean查询

bool查询，即布尔查询。就是利用逻辑运算来组合一个或多个查询子句的组合。bool查询支持的逻辑运算有：

- must：必须匹配每个子查询，类似“与”
- should：选择性匹配子查询，类似“或”
- must_not：必须不匹配，**不参与算分**，类似“非”
- filter：必须匹配，**不参与算分**

bool查询的语法如下：

```JSON
GET /items/_search
{
  "query": {
    "bool": {
      "must": [
        {"match": {"name": "手机"}}
      ],
      "should": [
        {"term": {"brand": { "value": "vivo" }}},
        {"term": {"brand": { "value": "小米" }}}
      ],
      "must_not": [
        {"range": {"price": {"gte": 2500}}}
      ],
      "filter": [
        {"range": {"price": {"lte": 1000}}}
      ]
    }
  }
}
```

出于性能考虑，与搜索关键字无关的查询尽量采用must_not或filter逻辑运算，避免参与相关性算分。

例如黑马商城的搜索页面：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618142038494.webp" alt="image" width="100%"> </div>

其中输入框的搜索条件肯定要参与相关性算分，可以采用match。但是价格范围过滤、品牌过滤、分类过滤等尽量采用filter，不要参与相关性算分。

比如，我们要搜索`手机`，但品牌必须是`华为`，价格必须是`900~1599`，那么可以这样写：

```JSON
GET /items/_search
{
  "query": {
    "bool": {
      "must": [
        {"match": {"name": "手机"}}
      ],
      "filter": [
        {"term": {"brand": { "value": "华为" }}},
        {"range": {"price": {"gte": 90000, "lt": 159900}}}
      ]
    }
  }
}
```

### 查询结果处理

#### 排序

elasticsearch默认是根据相关度算分（`_score`）来排序，但是也支持自定义方式对搜索结果排序。不过分词字段无法排序，能参与排序字段类型有：`keyword`类型、数值类型、地理坐标类型、日期类型等。详细说明可以参考[官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/7.12/sort-search-results.html)。

语法说明：

```JSON
GET /indexName/_search
{
  "query": {
    "match_all": {}
  },
  "sort": [
    {
      "排序字段": {
        "order": "排序方式asc和desc"
      }
    }
  ]
}
```

示例，我们按照商品价格排序：

```JSON
GET /items/_search
{
  "query": {
    "match_all": {}
  },
  "sort": [
    {
      "price": {
        "order": "desc"
      }
    }
  ]
}
```

#### 分页

elasticsearch 默认情况下只返回top10的数据。而如果要查询更多数据就需要修改分页参数了。

##### 基础分页

elasticsearch中通过修改`from`、`size`参数来控制要返回的分页结果：

- `from`：从第几个文档开始
- `size`：总共查询几个文档

类似于mysql中的`limit ?, ?`，参阅[官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/7.12/paginate-search-results.html)。

语法如下：

```JSON
GET /items/_search
{
  "query": {
    "match_all": {}
  },
  "from": 0, // 分页开始的位置，默认为0
  "size": 10,  // 每页文档数量，默认10
  "sort": [
    {
      "price": {
        "order": "desc"
      }
    }
  ]
}
```

##### 深度分页

elasticsearch的数据一般会采用分片存储，也就是把一个索引中的数据分成N份，存储到不同节点上。这种存储方式比较有利于数据扩展，但给分页带来了一些麻烦。

比如一个索引库中有100000条数据，分别存储到4个分片，每个分片25000条数据。现在每页查询10条，查询第99页。那么分页查询的条件如下：

```JSON
GET /items/_search
{
  "from": 990, // 从第990条开始查询
  "size": 10, // 每页查询10条
  "sort": [
    {
      "price": "asc"
    }
  ]
}
```

从语句来分析，要查询第990~1000名的数据。

从实现思路来分析，肯定是将所有数据排序，找出前1000名，截取其中的990~1000的部分。但问题来了，我们如何才能找到所有数据中的前1000名呢？

要知道每一片的数据都不一样，第1片上的第900-1000，在另1个节点上并不一定依然是990-1000名。所以我们只能在每一个分片上都找出排名前1000的数据，然后汇总到一起，重新排序，才能找出整个索引库中真正的前1000名，此时截取990-1000的数据即可。

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618143605282.webp" alt="image" width="100%"> </div>

试想一下，假如我们现在要查询的是第999页数据呢，是不是要找第9990~10000的数据，那岂不是需要把每个分片中的前10000名数据都查询出来，汇总在一起，在内存中排序？如果查询的分页深度更深呢，需要一次检索的数据岂不是更多？

由此可知，当查询分页深度较大时，汇总数据过多，对内存和CPU会产生非常大的压力。

因此elasticsearch会禁止`from+ size`` `超过10000的请求。

针对深度分页，elasticsearch提供了两种解决方案：

- `search after`：分页时需要排序，原理是从上一次的排序值开始，查询下一页数据。官方推荐使用的方式。
- `scroll`：原理将排序后的文档id形成快照，保存下来，基于快照做分页。官方已经不推荐使用。

详情见[文档](https://www.elastic.co/guide/en/elasticsearch/reference/7.12/paginate-search-results.html)

> **总结：**
>
> 大多数情况下，我们采用普通分页就可以了。查看百度、京东等网站，会发现其分页都有限制。例如百度最多支持77页，每页不足20条。京东最多100页，每页最多60条。
>
> 因此，一般我们采用限制分页深度的方式即可，无需实现深度分页。

#### 高亮

高亮：就是在搜索结果中把搜索关键字突出显示。

##### 高亮原理

我们在百度，京东搜索时，关键字会变成红色，比较醒目，这叫高亮显示：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618144330191.webp" alt="image" width="100%"> </div>

观察页面源码，你会发现两件事情：

- 高亮词条都被加了`<em>`标签
- `<em>`标签都添加了红色样式

css样式肯定是前端实现页面的时候写好的，但是前端编写页面的时候是不知道页面要展示什么数据的，不可能给数据加标签。而服务端实现搜索功能，要是有`elasticsearch`做分词搜索，是知道哪些词条需要高亮的。

因此词条的**高亮标签肯定是由服务端提供数据的时候已经加上的**。

因此实现高亮的思路就是：

- 用户输入搜索关键字搜索数据
- 服务端根据搜索关键字到elasticsearch搜索，并给搜索结果中的关键字词条添加`html`标签
- 前端提前给约定好的`html`标签添加`CSS`样式

##### 实现高亮

事实上elasticsearch已经提供了给搜索关键字加标签的语法，无需我们自己编码。

基本语法如下：

```JSON
GET /{索引库名}/_search
{
  "query": {
    "match": {
      "搜索字段": "搜索关键字"
    }
  },
  "highlight": {
    "fields": {
      "高亮字段名称": {
        "pre_tags": "<em>",
        "post_tags": "</em>"
      }
    }
  }
}
```

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618144529583.webp" alt="image" width="100%"> </div>

> **注意**：
>
> - 搜索必须有查询条件，而且是全文检索类型的查询条件，例如`match`
> - 参与高亮的字段必须是`text`类型的字段
> - 默认情况下参与高亮的字段要与搜索字段一致，除非添加：`required_field_match=false`

### 数据聚合

聚合（`aggregations`）可以让我们极其方便的实现对数据的统计、分析、运算。例如：

- 什么品牌的手机最受欢迎？
- 这些手机的平均价格、最高价格、最低价格？
- 这些手机每月的销售情况如何？

实现这些统计功能的比数据库的sql要方便的多，而且查询速度非常快，可以实现近实时搜索效果。[点击查看官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/7.12/search-aggregations.html)

聚合常见的有三类：

-  **桶（**`Bucket`）聚合：用来对文档做分组 
  - `TermAggregation`：按照文档字段值分组，例如按照品牌值分组、按照国家分组
  - `Date Histogram`：按照日期阶梯分组，例如一周为一组，或者一月为一组
-  **度量（`Metric`**）聚合：用以计算一些值，比如：最大值、最小值、平均值等 
  - `Avg`：求平均值
  - `Max`：求最大值
  - `Min`：求最小值
  - `Stats`：同时求`max`、`min`、`avg`、`sum`等
-  **管道（**`pipeline`）聚合：其它聚合的结果为基础做进一步运算 

**注意：**参加聚合的字段必须是keyword、日期、数值、布尔类型

#### Bucket聚合

例如我们要统计所有商品中共有哪些商品分类，其实就是以分类（category）字段对数据分组。category值一样的放在同一组，属于`Bucket`聚合中的`Term`聚合。

基本语法如下：

```JSON
GET /items/_search
{
  "size": 0, 
  "aggs": {
    "category_agg": {
      "terms": {
        "field": "category",
        "size": 20
      }
    }
  }
}
```

语法说明：

- `size`：设置`size`为0，就是每页查0条，则结果中就不包含文档，只包含聚合
- `aggs`：定义聚合
  - `category_agg`：聚合名称，自定义，但不能重复
    - `terms`：聚合的类型，按分类聚合，所以用`term`
      - `field`：参与聚合的字段名称
      - `size`：希望返回的聚合结果的最大数量

来看下查询的结果：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618161710582.webp" alt="image" width="100%"> </div>

#### 带条件聚合

默认情况下，Bucket聚合是对索引库的所有文档做聚合，例如我们统计商品中所有的品牌，结果如下：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618161752364.webp" alt="image" width="100%"> </div>

可以看到统计出的品牌非常多。

但真实场景下，用户会输入搜索条件，因此聚合必须是对搜索结果聚合。那么聚合必须添加限定条件。

例如，我想知道价格高于3000元的手机品牌有哪些，该怎么统计呢？

我们需要从需求中分析出搜索查询的条件和聚合的目标：

- 搜索查询条件：
  - 价格高于3000
  - 必须是手机
- 聚合目标：统计的是品牌，肯定是对brand字段做term聚合

语法如下：

```JSON
GET /items/_search
{
  "query": {
    "bool": {
      "filter": [
        {
          "term": {
            "category": "手机"
          }
        },
        {
          "range": {
            "price": {
              "gte": 300000
            }
          }
        }
      ]
    }
  }, 
  "size": 0, 
  "aggs": {
    "brand_agg": {
      "terms": {
        "field": "brand",
        "size": 20
      }
    }
  }
}
```

聚合结果如下：

```JSON
{
  "took" : 2,
  "timed_out" : false,
  "hits" : {
    "total" : {
      "value" : 13,
      "relation" : "eq"
    },
    "max_score" : null,
    "hits" : [ ]
  },
  "aggregations" : {
    "brand_agg" : {
      "doc_count_error_upper_bound" : 0,
      "sum_other_doc_count" : 0,
      "buckets" : [
        {
          "key" : "华为",
          "doc_count" : 7
        },
        {
          "key" : "Apple",
          "doc_count" : 5
        },
        {
          "key" : "小米",
          "doc_count" : 1
        }
      ]
    }
  }
}
```

可以看到，结果中只剩下3个品牌了。

#### Metric聚合

我们统计了价格高于3000的手机品牌，形成了一个个桶。现在我们需要对桶内的商品做运算，获取每个品牌价格的最小值、最大值、平均值。

这就要用到`Metric`聚合了，例如`stat`聚合，就可以同时获取`min`、`max`、`avg`等结果。

语法如下：

```JSON
GET /items/_search
{
  "query": {
    "bool": {
      "filter": [
        {
          "term": {
            "category": "手机"
          }
        },
        {
          "range": {
            "price": {
              "gte": 300000
            }
          }
        }
      ]
    }
  }, 
  "size": 0, 
  "aggs": {
    "brand_agg": {
      "terms": {
        "field": "brand",
        "size": 20
      },
      "aggs": {
        "stats_meric": {
          "stats": {
            "field": "price"
          }
        }
      }
    }
  }
}
```

`query`部分就不说了，我们重点解读聚合部分语法。

可以看到我们在`brand_agg`聚合的内部，我们新加了一个`aggs`参数。这个聚合就是`brand_agg`的子聚合，会对`brand_agg`形成的每个桶中的文档分别统计。

- `stats_meric`：聚合名称
  - `stats`：聚合类型，stats是`metric`聚合的一种
    - `field`：聚合字段，这里选择`price`，统计价格

由于stats是对brand_agg形成的每个品牌桶内文档分别做统计，因此每个品牌都会统计出自己的价格最小、最大、平均值。

结果如下：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618161910783.webp" alt="image" width="100%"> </div>

另外，我们还可以让聚合按照每个品牌的价格平均值排序：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618161940412.webp" alt="image" width="100%"> </div>

# RestClient API

ES官方提供了各种不同语言的客户端，用来操作ES。这些客户端的本质就是组装DSL语句，通过http请求发送给ES。官方文档如下：[Elasticsearch clients](https://www.elastic.co/docs/reference/elasticsearch-clients)

由于ES目前最新版本是8.8，提供了全新版本的客户端，老版本的客户端已经被标记为过时。而我们采用的是7.12版本，因此只能使用老版本客户端：

下面将会使用酒店数据来演示Client的配置使用，以下是数据库的定义：

```sql
-- auto-generated definition
create table tb_hotel
(
    id        bigint       not null comment '酒店id'
        primary key,
    name      varchar(255) not null comment '酒店名称',
    address   varchar(255) not null comment '酒店地址',
    price     int(10)      not null comment '酒店价格',
    score     int(2)       not null comment '酒店评分',
    brand     varchar(32)  not null comment '酒店品牌',
    city      varchar(32)  not null comment '所在城市',
    star_name varchar(16)  null comment '酒店星级，1星到5星，1钻到5钻',
    business  varchar(255) null comment '商圈',
    latitude  varchar(32)  not null comment '纬度',
    longitude varchar(32)  not null comment '经度',
    pic       varchar(255) null comment '酒店图片'
)
    row_format = COMPACT;
```

在Elasticsearch中创建对应的索引库，`address` 要设置为 `"index": false`**放弃地址的搜索能力**，`all` 字段 + `copy_to`希望用户在搜索框输入“如家 国贸”时，能同时匹配到 `name`（酒店名） 和 `business`（商圈），DSL语句如下：

```json
PUT /hotel
{
  "mappings": {
    "properties": {
      "id": {
        "type": "keyword"
      },
      "name": {
        "type": "text",
        "analyzer": "ik_max_word",
        "copy_to": "all"
      },
      "address": {
        "type": "keyword",
        "index": false
      },
      "price": {
        "type": "integer"
      },
      "score": {
        "type": "integer"
      },
      "brand": {
        "type": "keyword"
      },
      "city": {
        "type": "keyword"
      },
      "star_name": {
        "type": "keyword"
      },
      "business": {
        "type": "keyword",
        "copy_to": "all"
      },
      "location": {
        "type": "geo_point"
      },
      "pic": {
        "type": "keyword"
      },
      "all":{
        "type": "text",
        "analyzer": "ik_max_word"
      }
    }
  }
}
```

## 初始化RestClient

在elasticsearch提供的API中，与elasticsearch一切交互都封装在一个名为`RestHighLevelClient`的类中，必须先完成这个对象的初始化，建立与elasticsearch的连接。

模块中引入`es`的`RestHighLevelClient`依赖：

```XML
<dependency>
    <groupId>org.elasticsearch.client</groupId>
    <artifactId>elasticsearch-rest-high-level-client</artifactId>
</dependency>
```

因为SpringBoot默认的ES版本是`7.6.2`，所以我们在模块pom文件中需要覆盖默认的ES版本：

```XML
    <properties>
        <java.version>1.8</java.version>
        <elasticsearch.version>7.12.1</elasticsearch.version>
    </properties>
```

初始化RestHighLevelClient：

```Java
RestHighLevelClient client = new RestHighLevelClient(RestClient.builder(
        HttpHost.create("http://192.168.150.101:9200")
));
```

## 索引库操作

### 创建索引库

- 1）创建Request对象。
  - 因为是创建索引库的操作，因此Request是`CreateIndexRequest`。
- 2）添加请求参数
  - 其实就是Json格式的Mapping映射参数。因为json字符串很长，这里是定义了静态字符串常量`MAPPING_TEMPLATE`，让代码看起来更加优雅。
- 3）发送请求
  - `client.`indices`()`方法的返回值是`IndicesClient`类型，封装了所有与索引库操作有关的方法。例如创建索引、删除索引、判断索引是否存在等

```java
@Test
void testCreateIndex() throws IOException {
    // 1.创建Request对象
    CreateIndexRequest request = new CreateIndexRequest("hotel");
    // 2.准备请求参数
    request.source(MAPPING_TEMPLATE, XContentType.JSON);
    // 3.发送请求
    restHighLevelClient.indices().create(request, RequestOptions.DEFAULT);
}

static final String MAPPING_TEMPLATE = "{\n" +
        "  \"mappings\": {\n" +
        "    \"properties\": {\n" +
        "      \"id\": {\n" +
        "        \"type\": \"keyword\"\n" +
        "      },\n" +
        "      \"name\": {\n" +
        "        \"type\": \"text\",\n" +
        "        \"analyzer\": \"ik_max_word\",\n" +
        "        \"copy_to\": \"all\"\n" +
        "      },\n" +
        "      \"address\": {\n" +
        "        \"type\": \"keyword\",\n" +
        "        \"index\": false\n" +
        "      },\n" +
        "      \"price\": {\n" +
        "        \"type\": \"integer\"\n" +
        "      },\n" +
        "      \"score\": {\n" +
        "        \"type\": \"integer\"\n" +
        "      },\n" +
        "      \"brand\": {\n" +
        "        \"type\": \"keyword\"\n" +
        "      },\n" +
        "      \"city\": {\n" +
        "        \"type\": \"keyword\"\n" +
        "      },\n" +
        "      \"star_name\": {\n" +
        "        \"type\": \"keyword\"\n" +
        "      },\n" +
        "      \"business\": {\n" +
        "        \"type\": \"keyword\",\n" +
        "        \"copy_to\": \"all\"\n" +
        "      },\n" +
        "      \"location\": {\n" +
        "        \"type\": \"geo_point\"\n" +
        "      },\n" +
        "      \"pic\": {\n" +
        "        \"type\": \"keyword\"\n" +
        "      },\n" +
        "      \"all\":{\n" +
        "        \"type\": \"text\",\n" +
        "        \"analyzer\": \"ik_max_word\"\n" +
        "      }\n" +
        "    }\n" +
        "  }\n" +
        "}";

```

### 删除索引库

删除索引库的请求非常简单：

```JSON
DELETE /hotel
```

与创建索引库相比：

- 请求方式从PUT变为DELTE
- 请求路径不变
- 无请求参数

所以代码的差异，注意体现在Request对象上。流程如下：

- 1）创建Request对象。这次是DeleteIndexRequest对象
- 2）准备参数。这里是无参，因此省略
- 3）发送请求。改用delete方法

```Java
@Test
void testDeleteIndex() throws IOException {
    // 1.创建Request对象
    DeleteIndexRequest request = new DeleteIndexRequest("hotel");
    // 2.发送请求
    restHighLevelClient.indices().delete(request, RequestOptions.DEFAULT);
}
```

### 判断索引库是否存在

判断索引库是否存在，本质就是查询，对应的请求语句是：

```JSON
GET /hotel
```

因此与删除的Java代码流程是类似的，流程如下：

- 1）创建Request对象。这次是GetIndexRequest对象
- 2）准备参数。这里是无参，直接省略
- 3）发送请求。改用exists方法

```Java
@Test
void testExistsIndex() throws IOException {
    // 1.创建Request对象
    GetIndexRequest request = new GetIndexRequest("hotel");
    // 2.发送请求
    boolean exists = restHighLevelClient.indices().exists(request, RequestOptions.DEFAULT);
    // 3.输出
    System.err.println(exists ? "索引库已经存在！" : "索引库不存在！");
}
```

## 文档操作

### 新增文档

新增文档的请求语法如下：

```JSON
POST /{索引库名}/_doc/1
{
    "name": "Jack",
    "age": 21
}
```

索引库结构与数据库结构还存在一些差异，因此我们要定义一个索引库结构对应的实体。

```java
package cn.itcast.hotel.pojo;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class HotelDoc {
    private Long id;
    private String name;
    private String address;
    private Integer price;
    private Integer score;
    private String brand;
    private String city;
    private String starName;
    private String business;
    private String location;
    private String pic;

    public HotelDoc(Hotel hotel) {
        this.id = hotel.getId();
        this.name = hotel.getName();
        this.address = hotel.getAddress();
        this.price = hotel.getPrice();
        this.score = hotel.getScore();
        this.brand = hotel.getBrand();
        this.city = hotel.getCity();
        this.starName = hotel.getStarName();
        this.business = hotel.getBusiness();
        this.location = hotel.getLatitude() + ", " + hotel.getLongitude();
        this.pic = hotel.getPic();
    }
}
```

主要步骤分为三步：

- 1）创建Request对象，这里是`IndexRequest`，因为添加文档就是创建倒排索引的过程
- 2）准备请求参数，本例中就是Json文档
- 3）发送请求

```java
@Test
void testAddDocument() throws IOException {
    // 1.1 根据id查询商品数据
    Hotel hotel = hotelService.getById(36934L);
    // 1.2 转换为文档类型
    HotelDoc hotelDoc = new HotelDoc(hotel);
    // 2.1 准备Request对象
    IndexRequest request = new IndexRequest("hotel").id(hotelDoc.getId().toString());
    // 2.2 准备Json文档
    request.source(JSON.toJSONString(hotelDoc), XContentType.JSON);
    // 2.3 发送请求
    restHighLevelClient.index(request, RequestOptions.DEFAULT);
}
```

### 查询文档

查询的请求语句如下：

```JSON
GET /{索引库名}/_doc/{id}
```

其它代码与之前类似，流程如下：

- 1）准备Request对象。这次是查询，所以是`GetRequest`
- 2）发送请求，得到结果。因为是查询，这里调用`client.get()`方法
- 3）解析结果，就是对JSON做反序列化

```java
@Test
void testGetDocuments() throws IOException {
    // 准备请求
    GetRequest request = new GetRequest("hotel", "36934");
    // 发送请求 获得响应
    GetResponse response = restHighLevelClient.get(request, RequestOptions.DEFAULT);
    // 解析响应结果
    HotelDoc hotelDoc = JSON.parseObject(response.getSourceAsString(), HotelDoc.class);
    System.out.println(hotelDoc);
}
```

### 修改文档

修改有两种方式：

- 全量修改：本质是先根据id删除，再新增
- 局部修改：修改文档中的指定字段值

在RestClient的API中，全量修改与新增的API完全一致，判断依据是ID：

- 如果新增时，ID已经存在，则修改
- 如果新增时，ID不存在，则新增

这里不再赘述，我们主要关注局部修改的API即可。

局部修改的请求语法如下：

```JSON
POST /{索引库名}/_update/{id}
{
  "doc": {
    "字段名": "字段值",
    "字段名": "字段值"
  }
}
```

示例代码如下：

```java
@Test
void testUpdateDocument() throws IOException {
    // 1.准备Request
    UpdateRequest request = new UpdateRequest("hotel", "36934");
    // 2.准备请求参数
    request.doc(
            "price", 951,
            "name", "我更新酒店"
    );
    // 3.发送请求
    restHighLevelClient.update(request, RequestOptions.DEFAULT);
}
```

### 删除文档

删除的请求语句如下：

```JSON
DELETE /hotel/_doc/{id}
```

与查询相比，仅仅是请求方式从`DELETE`变成`GET`，可以想象Java代码应该依然是2步走：

- 1）准备Request对象，因为是删除，这次是`DeleteRequest`对象。要指定索引库名和id
- 2）发送请求。因为是删除，所以是`client.delete()`方法

```java
@Test
void testDeleteDocument() throws IOException {
    // 1.准备Request，两个参数，第一个是索引库名，第二个是文档id
    DeleteRequest request = new DeleteRequest("hotel", "36934");
    // 2.发送请求
    restHighLevelClient.delete(request, RequestOptions.DEFAULT);
}
```

### 批量导入文档

在之前的案例中，我们都是操作单个文档。而数据库中的商品数据实际会达到数十万条，某些项目中可能达到数百万条。

我们如果要将这些数据导入索引库，肯定不能逐条导入，而是采用批处理方案。常见的方案有：

- 利用Logstash批量导入
  - 需要安装Logstash
  - 对数据的再加工能力较弱
  - 无需编码，但要学习编写Logstash导入配置
- 利用JavaAPI批量导入
  - 需要编码，但基于JavaAPI，学习成本低
  - 更加灵活，可以任意对数据做再加工处理后写入索引库

接下来，学习下如何利用JavaAPI实现批量文档导入。

`BulkRequest`本身其实并没有请求参数，其本质就是将多个普通的CRUD请求组合在一起发送。例如：

- 批量新增文档，就是给每个文档创建一个`IndexRequest`请求，然后封装到`BulkRequest`中，一起发出。
- 批量删除，就是创建N个`DeleteRequest`请求，然后封装到`BulkRequest`，一起发出

因此`BulkRequest`中提供了`add`方法，用以添加其它CRUD的请求，能添加的请求有：

- `IndexRequest`，也就是新增
- `UpdateRequest`，也就是修改
- `DeleteRequest`，也就是删除

此Bulk中添加了多个`IndexRequest`，就是批量新增功能了。示例：

```Java
@Test
void testBulk() throws IOException {
    // 1.创建Request
    BulkRequest request = new BulkRequest();
    // 2.准备请求参数
    request.add(new IndexRequest("items").id("1").source("json doc1", XContentType.JSON));
    request.add(new IndexRequest("items").id("2").source("json doc2", XContentType.JSON));
    // 3.发送请求
    client.bulk(request, RequestOptions.DEFAULT);
}
```

当我们要导入酒店数据时，由于商品数量达到数十万，因此不可能一次性全部导入。建议采用循环遍历方式，每次导入1000条左右的数据。

```java
@Test
void testLoadHotelDocs() throws IOException {
    // 分页查询酒店数据
    int pageNo = 1;
    int size = 1000;
    while (true) {
        // 当前会有深度分页问题 可以采用游标分页方式
        Page<Hotel> page = hotelService.lambdaQuery().page(new Page<Hotel>(pageNo, size));
        // 非空校验
        List<Hotel> hotels = page.getRecords();
        if (CollectionUtils.isEmpty(hotels)) {
            return;
        }
        log.info("加载第{}页数据，共{}条", pageNo, hotels.size());
        // 1.创建Request
        BulkRequest request = new BulkRequest("hotel");
        // 2.准备参数，添加多个新增的Request
        for (Hotel hotel : hotels) {
            // 2.1.转换为文档类型hotelDoc
            HotelDoc hotelDoc = new HotelDoc(hotel);
            // 2.2.创建新增文档的Request对象
            request.add(new IndexRequest()
                    .id(hotelDoc.getId().toString())
                    .source(JSON.toJSONString(hotelDoc), XContentType.JSON));
        }
        // 3.发送请求
        restHighLevelClient.bulk(request, RequestOptions.DEFAULT);

        // 翻页
        pageNo++;
    }
}
```

## 查询

文档的查询依然使用 `RestHighLevelClient`对象，查询的基本步骤如下：

- 1）创建`request`对象，这次是搜索，所以是`SearchRequest`
- 2）准备请求参数，也就是查询DSL对应的JSON参数
- 3）发起请求
- 4）解析响应，响应结果相对复杂，需要逐层解析

### 快速入门

由于Elasticsearch对外暴露的接口都是Restful风格的接口，因此JavaAPI调用就是在发送Http请求。而我们核心要做的就是利用**利用Java代码组织请求参数**，**解析响应结果**。

这个参数的格式完全参考DSL查询语句的JSON结构，因此在学习的过程中，会不断的把JavaAPI与DSL语句对比。

首先以`match_all`查询为例，其DSL和JavaAPI的对比如图：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618145254987.webp" alt="image" width="100%"> </div>

代码解读：

-  第一步，创建`SearchRequest`对象，指定索引库名 
-  第二步，利用`request.source()`构建DSL，DSL中可以包含查询、分页、排序、高亮等 
  - `query()`：代表查询条件，利用`QueryBuilders.matchAllQuery()`构建一个`match_all`查询的DSL
-  第三步，利用`client.search()`发送请求，得到响应 

这里关键的API有两个，一个是`request.source()`，它构建的就是DSL中的完整JSON参数。其中包含了`query`、`sort`、`from`、`size`、`highlight`等所有功能：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618145339963.webp" alt="image" width="100%"> </div>

另一个是`QueryBuilders`，其中包含了我们学习过的各种**叶子查询**、**复合查询**等：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618145403680.webp" alt="image" width="100%"> </div>

在发送请求以后，得到了响应结果`SearchResponse`，这个类的结构与我们在kibana中看到的响应结果JSON结构完全一致：

```JSON
{
    "took" : 0,
    "timed_out" : false,
    "hits" : {
        "total" : {
            "value" : 2,
            "relation" : "eq"
        },
        "max_score" : 1.0,
        "hits" : [
            {
                "_index" : "heima",
                "_type" : "_doc",
                "_id" : "1",
                "_score" : 1.0,
                "_source" : {
                "info" : "Java讲师",
                "name" : "赵云"
                }
            }
        ]
    }
}
```

因此，我们解析`SearchResponse`的代码就是在解析这个JSON结果，对比如下：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618145456255.webp" alt="image" width="100%"> </div>

elasticsearch返回的结果是一个JSON字符串，结构包含：

- `hits`：命中的结果 
  - `total`：总条数，其中的value是具体的总条数值
  - `max_score`：所有结果中得分最高的文档的相关性算分
  - `hits`：搜索结果的文档数组，其中的每个文档都是一个json对象 
    - `_source`：文档中的原始数据，也是json对象

因此，我们解析响应结果，就是逐层解析JSON字符串，流程如下：

- `SearchHits`：通过`response.getHits()`获取，就是JSON中的最外层的`hits`，代表命中的结果 
  - `SearchHits#getTotalHits().value`：获取总条数信息
  - `SearchHits#getHits()`：获取`SearchHit`数组，也就是文档数组 
    - `SearchHit#getSourceAsString()`：获取文档结果中的`_source`，也就是原始的`json`文档数据

### 叶子查询

所有的查询条件都是由QueryBuilders来构建的，叶子查询也不例外。因此整套代码中变化的部分仅仅是query条件构造的方式，其它不动。

例如`match`查询：

```Java
@Test
void testMatch() throws IOException {
    // 1.创建Request
    SearchRequest request = new SearchRequest("items");
    // 2.组织请求参数
    request.source().query(QueryBuilders.matchQuery("name", "脱脂牛奶"));
    // 3.发送请求
    SearchResponse response = client.search(request, RequestOptions.DEFAULT);
    // 4.解析响应
    handleResponse(response);
}
```

再比如`multi_match`查询：

```Java
@Test
void testMultiMatch() throws IOException {
    // 1.创建Request
    SearchRequest request = new SearchRequest("items");
    // 2.组织请求参数
    request.source().query(QueryBuilders.multiMatchQuery("脱脂牛奶", "name", "category"));
    // 3.发送请求
    SearchResponse response = client.search(request, RequestOptions.DEFAULT);
    // 4.解析响应
    handleResponse(response);
}
```

还有`range`查询：

```Java
@Test
void testRange() throws IOException {
    // 1.创建Request
    SearchRequest request = new SearchRequest("items");
    // 2.组织请求参数
    request.source().query(QueryBuilders.rangeQuery("price").gte(10000).lte(30000));
    // 3.发送请求
    SearchResponse response = client.search(request, RequestOptions.DEFAULT);
    // 4.解析响应
    handleResponse(response);
}
```

还有`term`查询：

```Java
@Test
void testTerm() throws IOException {
    // 1.创建Request
    SearchRequest request = new SearchRequest("items");
    // 2.组织请求参数
    request.source().query(QueryBuilders.termQuery("brand", "华为"));
    // 3.发送请求
    SearchResponse response = client.search(request, RequestOptions.DEFAULT);
    // 4.解析响应
    handleResponse(response);
}
```

### 复合查询

复合查询也是由`QueryBuilders`来构建，我们以`bool`查询为例，DSL和JavaAPI的对比如图：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618150129816.webp" alt="image" width="100%"> </div>

完整代码如下：

```Java
@Test
void testBool() throws IOException {
    // 1.创建Request
    SearchRequest request = new SearchRequest("items");
    // 2.组织请求参数
    // 2.1.准备bool查询
    BoolQueryBuilder bool = QueryBuilders.boolQuery();
    // 2.2.关键字搜索
    bool.must(QueryBuilders.matchQuery("name", "脱脂牛奶"));
    // 2.3.品牌过滤
    bool.filter(QueryBuilders.termQuery("brand", "德亚"));
    // 2.4.价格过滤
    bool.filter(QueryBuilders.rangeQuery("price").lte(30000));
    request.source().query(bool);
    // 3.发送请求
    SearchResponse response = client.search(request, RequestOptions.DEFAULT);
    // 4.解析响应
    handleResponse(response);
}
```

### 排序和分页

之前说过，`requeset.source()`就是整个请求JSON参数，所以排序、分页都是基于这个来设置，其DSL和JavaAPI的对比如下：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618150242663.webp" alt="image" width="100%"> </div>

完整示例代码：

```Java
@Test
void testPageAndSort() throws IOException {
    int pageNo = 1, pageSize = 5;

    // 1.创建Request
    SearchRequest request = new SearchRequest("items");
    // 2.组织请求参数
    // 2.1.搜索条件参数
    request.source().query(QueryBuilders.matchQuery("name", "脱脂牛奶"));
    // 2.2.排序参数
    request.source().sort("price", SortOrder.ASC);
    // 2.3.分页参数
    request.source().from((pageNo - 1) * pageSize).size(pageSize);
    // 3.发送请求
    SearchResponse response = client.search(request, RequestOptions.DEFAULT);
    // 4.解析响应
    handleResponse(response);
}
```

### 高亮

高亮查询与前面的查询有两点不同：

- 条件同样是在`request.source()`中指定，只不过高亮条件要基于`HighlightBuilder`来构造
- 高亮响应结果与搜索的文档结果不在一起，需要单独解析

首先来看高亮条件构造，其DSL和JavaAPI的对比如图：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618150900392.webp" alt="image" width="100%"> </div>

示例代码如下：

```Java
@Test
void testHighlight() throws IOException {
    // 1.创建Request
    SearchRequest request = new SearchRequest("items");
    // 2.组织请求参数
    // 2.1.query条件
    request.source().query(QueryBuilders.matchQuery("name", "脱脂牛奶"));
    // 2.2.高亮条件
    request.source().highlighter(
            SearchSourceBuilder.highlight()
                    .field("name")
                    .preTags("<em>")
                    .postTags("</em>")
    );
    // 3.发送请求
    SearchResponse response = client.search(request, RequestOptions.DEFAULT);
    // 4.解析响应
    handleResponse(response);
}
```

再来看结果解析，文档解析的部分不变，主要是高亮内容需要单独解析出来，其DSL和JavaAPI的对比如图：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618150937105.webp" alt="image" width="100%"> </div>

代码解读：

- 第`3、4`步：从结果中获取`_source`。`hit.getSourceAsString()`，这部分是非高亮结果，json字符串。还需要反序列为`ItemDoc`对象
- 第`5`步：获取高亮结果。`hit.getHighlightFields()`，返回值是一个`Map`，key是高亮字段名称，值是`HighlightField`对象，代表高亮值
- 第`5.1`步：从`Map`中根据高亮字段名称，获取高亮字段值对象`HighlightField`
- 第`5.2`步：从`HighlightField`中获取`Fragments`，并且转为字符串。这部分就是真正的高亮字符串了
- 最后：用高亮的结果替换`ItemDoc`中的非高亮结果

完整代码如下：

```Java
private void handleResponse(SearchResponse response) {
    SearchHits searchHits = response.getHits();
    // 1.获取总条数
    long total = searchHits.getTotalHits().value;
    System.out.println("共搜索到" + total + "条数据");
    // 2.遍历结果数组
    SearchHit[] hits = searchHits.getHits();
    for (SearchHit hit : hits) {
        // 3.得到_source，也就是原始json文档
        String source = hit.getSourceAsString();
        // 4.反序列化
        ItemDoc item = JSONUtil.toBean(source, ItemDoc.class);
        // 5.获取高亮结果
        Map<String, HighlightField> hfs = hit.getHighlightFields();
        if (CollUtils.isNotEmpty(hfs)) {
            // 5.1.有高亮结果，获取name的高亮结果
            HighlightField hf = hfs.get("name");
            if (hf != null) {
                // 5.2.获取第一个高亮结果片段，就是商品名称的高亮值
                String hfName = hf.getFragments()[0].string();
                item.setName(hfName);
            }
        }
        System.out.println(item);
    }
}
```

### 数据聚合

可以看到在DSL中，`aggs`聚合条件与`query`条件是同一级别，都属于查询JSON参数。因此依然是利用`request.source()`方法来设置。

不过聚合条件的要利用`AggregationBuilders`这个工具类来构造。DSL与JavaAPI的语法对比如下：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618162101851.webp" alt="image" width="100%"> </div>

聚合结果与搜索文档同一级别，因此需要单独获取和解析。具体解析语法如下：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618162125001.webp" alt="image" width="100%"> </div>

完整代码如下：

```Java
@Test
void testAgg() throws IOException {
    // 1.创建Request
    SearchRequest request = new SearchRequest("items");
    // 2.准备请求参数
    BoolQueryBuilder bool = QueryBuilders.boolQuery()
            .filter(QueryBuilders.termQuery("category", "手机"))
            .filter(QueryBuilders.rangeQuery("price").gte(300000));
    request.source().query(bool).size(0);
    // 3.聚合参数
    request.source().aggregation(
            AggregationBuilders.terms("brand_agg").field("brand").size(5)
    );
    // 4.发送请求
    SearchResponse response = client.search(request, RequestOptions.DEFAULT);
    // 5.解析聚合结果
    Aggregations aggregations = response.getAggregations();
    // 5.1.获取品牌聚合
    Terms brandTerms = aggregations.get("brand_agg");
    // 5.2.获取聚合中的桶
    List<? extends Terms.Bucket> buckets = brandTerms.getBuckets();
    // 5.3.遍历桶内数据
    for (Terms.Bucket bucket : buckets) {
        // 5.4.获取桶内key
        String brand = bucket.getKeyAsString();
        System.out.print("brand = " + brand);
        long count = bucket.getDocCount();
        System.out.println("; count = " + count);
    }
}
```

# 自动补全

## 安装拼音分词器

首先需要在 Elasticsearch 中安装 `elasticsearch-analysis-pinyin` 插件。

1. **下载插件**：访问 [elasticsearch-analysis-pinyin](https://github.com/medcl/elasticsearch-analysis-pinyin) 的 GitHub 页面，下载与你的 Elasticsearch 版本相匹配的插件压缩包。

2. **安装插件**：

   - **Docker 环境**：将下载的压缩包解压到 Elasticsearch 容器的 `plugins` 目录下。如果使用了数据卷挂载，需要将文件放入对应的主机目录。
   - **非 Docker 环境**：将插件解压到 Elasticsearch 安装目录的 `plugins/` 文件夹中。

3. **重启 Elasticsearch**：使插件生效。

   bash

   ```
   docker restart es
   ```

   

4. **测试插件**：可以使用 `_analyze` API 测试插件是否安装成功。

   json

   ```
   GET _analyze
   {
     "text": ["青春马文"],
    "analyzer": "pinyin"  
   }
   ```

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618214243344.webp" alt="image" width="100%"> </div>

## 自定义分词器

默认的拼音分词器会将每个汉字单独分为拼音，而我们希望的是每个词条形成一组拼音，需要对拼音分词器做个性化定制，形成自定义分词器。

elasticsearch中分词器（analyzer）的组成包含三部分：

- character filters：在tokenizer之前对文本进行处理。例如删除字符、替换字符
- tokenizer：将文本按照一定的规则切割成词条（term）。例如keyword，就是不分词；还有ik_smart
- tokenizer filter：将tokenizer输出的词条做进一步处理。例如大小写转换、同义词处理、拼音处理等
- 文档分词时会依次由这三部分来处理文档：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618215021125.webp" alt="image" width="100%"> </div>

我们可以在创建索引库时，通过settings来配置自定义的analyzer（分词器）：

```json
PUT /test
{
  "settings": {
    "analysis": {
      "analyzer": { // 自定义分词器
        "my_analyzer": {  // 分词器名称
          "tokenizer": "ik_max_word",
          "filter": "py"
        }
      },
      "filter": { // 自定义tokenizer filter
        "py": { // 过滤器名称
          "type": "pinyin", // 过滤器类型，这里是pinyin
          "keep_full_pinyin": false,
          "keep_joined_full_pinyin": true,
          "keep_original": true,
          "limit_first_letter_length": 16,
          "remove_duplicated_term": true,
          "none_chinese_pinyin_tokenize": false
        }
      }
    }
  }
}
```

拼音分词器适合在创建倒排索引的时候使用，并设置一个专门用于自动补全的 `completion` 类型字段，但是不可以在搜索的时候使用，这是为了避免拼音搜索带来同音字干扰，强烈建议为使用自定义分析器的字段设置 `search_analyzer: "ik_smart"`

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618214805629.webp" alt="image" width="100%"> </div>

```json
PUT /hotel
{
  "settings": {
    // ... 在此处放置上一步的自定义分析器配置 ...
  },
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "analyzer": "my_analyzer",
        "search_analyzer": "ik_smart" 
      },
      "suggest": {
        "type": "completion",
        "analyzer": "my_analyzer",
        "search_analyzer": "ik_smart"
      }
    }
  }
}
```

## DSL语法

elasticsearch提供了Completion Suggester查询来实现自动补全功能。这个查询会匹配以用户输入内容开头的词条并返回。为了提高补全查询的效率，对于文档中字段的类型有一些约束：

- 参与补全查询的字段必须是completion类型。
- 字段的内容一般是用来补全的多个词条形成的数组。
<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618215656056.webp" alt="image" width="100%"> </div>


数据索引完成后，就可以使用 `suggest` 功能进行查询了

```json
POST /test/_search
{
  "suggest": {
    "title_suggest": {
      "text": "so", // 关键字
      "completion": {
        "field": "title", // 补全字段
        "skip_duplicates": true, // 跳过重复的
        "size": 10 // 获取前10条结果
      }
    }
  }
}
```

结果如下：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618220220251.webp" alt="image" width="100%"> </div>

## 实战

### 酒店索引库数据结构

我们需要**两种不同的分析器**，分别服务于不同场景：

| 分析器名称            | Tokenizer     | Filter | 用途                                                         |
| :-------------------- | :------------ | :----- | :----------------------------------------------------------- |
| `text_analyzer`       | `ik_max_word` | `py`   | **索引时**对文本字段（如 name、all）进行分词，生成包含拼音的倒排索引 |
| `completion_analyzer` | `keyword`     | `py`   | **补全时**对 suggestion 字段进行处理，保留完整词条并生成拼音变体 |

**为什么需要两个不同的分析器？**

- `text_analyzer` 使用 `ik_max_word`：将文本拆分为尽可能多的词元，提高召回率（Recall）
- `completion_analyzer` 使用 `keyword`：**不拆分**原始词条，确保补全建议完整匹配用户输入的前缀
  - 例如：用户输入 "北京"，补全建议应返回 "北京国贸" 而不是拆成 "北"、"京"、"国贸"

`suggestion`字段专门用来做补全，索引库创建如下：

```json
PUT /hotel
{
  "settings": {
    "analysis": {
      "analyzer": {
        "text_anlyzer": {
          "tokenizer": "ik_max_word",
          "filter": "py"
        },
        "completion_analyzer": {
          "tokenizer": "keyword",
          "filter": "py"
        }
      },
      "filter": {
        "py": {
          "type": "pinyin",
          "keep_full_pinyin": false,
          "keep_joined_full_pinyin": true,
          "keep_original": true,
          "limit_first_letter_length": 16,
          "remove_duplicated_term": true,
          "none_chinese_pinyin_tokenize": false
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "id":{
        "type": "keyword"
      },
      "name":{
        "type": "text",
        "analyzer": "text_anlyzer",
        "search_analyzer": "ik_smart",
        "copy_to": "all"
      },
      "address":{
        "type": "keyword",
        "index": false
      },
      "price":{
        "type": "integer"
      },
      "score":{
        "type": "integer"
      },
      "brand":{
        "type": "keyword",
        "copy_to": "all"
      },
      "city":{
        "type": "keyword"
      },
      "starName":{
        "type": "keyword"
      },
      "business":{
        "type": "keyword",
        "copy_to": "all"
      },
      "location":{
        "type": "geo_point"
      },
      "pic":{
        "type": "keyword",
        "index": false
      },
      "all":{
        "type": "text",
        "analyzer": "text_anlyzer",
        "search_analyzer": "ik_smart"
      },
      "suggestion":{
          "type": "completion",
          "analyzer": "completion_analyzer"
      }
    }
  }
}
```

`suggestion` 是专门为自动补全预留的字段，其类型为 `List<String>`，可以包含多个补全建议源。这允许一个文档（酒店）同时提供多个建议词条，例如：

- 品牌：`如家`
- 商圈：`国贸`、`CBD`

当用户输入 `如家`、`国贸`、`rj` 时，都能触发该酒店的补全建议。

```java
package cn.itcast.hotel.pojo;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

@Data
@NoArgsConstructor
public class HotelDoc {
    private Long id;
    private String name;
    private String address;
    private Integer price;
    private Integer score;
    private String brand;
    private String city;
    private String starName;
    private String business;
    private String location;
    private String pic;
    private List<String> suggestion;

    public HotelDoc(Hotel hotel) {
        this.id = hotel.getId();
        this.name = hotel.getName();
        this.address = hotel.getAddress();
        this.price = hotel.getPrice();
        this.score = hotel.getScore();
        this.brand = hotel.getBrand();
        this.city = hotel.getCity();
        this.starName = hotel.getStarName();
        this.business = hotel.getBusiness();
        this.location = hotel.getLatitude() + ", " + hotel.getLongitude();
        this.pic = hotel.getPic();
        if (hotel.getBusiness().contains("、")) {
            // 切分商圈信息
            String[] split = hotel.getBusiness().split("、");
            this.suggestion = new ArrayList<>(split.length + 1);
            this.suggestion.add(hotel.getBrand());
            Collections.addAll(this.suggestion, split);
        } else {
            this.suggestion = Arrays.asList(hotel.getBrand(), hotel.getBusiness());
        }
    }
}

```

### Java 代码实现补全查询

#### 初步认识

如下是参数构造的API：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618223031873.webp" alt="image" width="100%"> </div>

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618223330502.webp" alt="image" width="100%"> </div>

示例代码如下：

```java
@Test
public void testSuggestionsSearch() throws IOException {
    // 1.准备SearchRequest
    SearchRequest searchRequest = new SearchRequest("hotel");
    // 2.准备DSL
    searchRequest.source().suggest(new SuggestBuilder().addSuggestion("suggestions",
            SuggestBuilders.completionSuggestion("suggestion")
                    .prefix("sd").skipDuplicates(true).size(10)));

    // 3.发送请求
    SearchResponse response = restHighLevelClient.search(searchRequest, RequestOptions.DEFAULT);
    // 4.解析结果
    Suggest suggest = response.getSuggest();
    CompletionSuggestion suggestions = suggest.getSuggestion("suggestions");
    List<CompletionSuggestion.Entry.Option> options = suggestions.getOptions();
    List<String> list = new ArrayList<>(options.size());
    for (CompletionSuggestion.Entry.Option option : options) {
        String text = option.getText().toString();
        list.add(text);
    }
    System.out.println(list);
}
```

#### 完整实现

1. 在`HotelController`中添加新接口，接收新的请求：

```java
@GetMapping("suggestion")
public List<String> getSuggestions(@RequestParam("key") String prefix) {
    return hotelService.getSuggestions(prefix);
}
```

2. `HotelService`中实现该方法：

```java
@Override
public List<String> getSuggestions(String prefix) {
    try {
        // 1.准备Request
        SearchRequest request = new SearchRequest("hotel");
        // 2.准备DSL
        request.source().suggest(new SuggestBuilder().addSuggestion(
            "suggestions",
            SuggestBuilders.completionSuggestion("suggestion")
            .prefix(prefix)
            .skipDuplicates(true)
            .size(10)
        ));
        // 3.发起请求
        SearchResponse response = client.search(request, RequestOptions.DEFAULT);
        // 4.解析结果
        Suggest suggest = response.getSuggest();
        // 4.1.根据补全查询名称，获取补全结果
        CompletionSuggestion suggestions = suggest.getSuggestion("suggestions");
        // 4.2.获取options
        List<CompletionSuggestion.Entry.Option> options = suggestions.getOptions();
        // 4.3.遍历
        List<String> list = new ArrayList<>(options.size());
        for (CompletionSuggestion.Entry.Option option : options) {
            String text = option.getText().toString();
            list.add(text);
        }
        return list;
    } catch (IOException e) {
        throw new RuntimeException(e);
    }
}
```

前端页面展示如下：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618223952164.webp" alt="image" width="100%"> </div>

# 数据同步

elasticsearch中的酒店数据来自于mysql数据库，因此mysql数据发生改变时，elasticsearch也必须跟着改变，这个就是elasticsearch与mysql之间的**数据同步**。

常见的数据同步方案有三种：

- 同步调用

  - 优点：实现简单，粗暴

  - 缺点：业务耦合度高

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618224317342.webp" alt="image" width="100%"> </div>

- 异步通知

  - 优点：低耦合，实现难度一般

  - 缺点：依赖mq的可靠性

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618224407668.webp" alt="image" width="100%"> </div>

- 监听binlog

  - 优点：完全解除服务间耦合

  - 缺点：开启binlog增加数据库负担、实现复杂度高

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618224442002.webp" alt="image" width="100%"> </div>

## 异步通知实现

- hotel-admin对mysql数据库数据完成增、删、改后，发送MQ消息
- hotel-demo监听MQ，接收到消息后完成elasticsearch数据修改

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-19-image-20260619135008548.webp" alt="image" width="100%"> </div>

1. 声明队列交换机名称

在hotel-admin和hotel-demo中新建一个类`MqConstants`：

```java
package cn.itcast.hotel.constant;

public class MqConstants {
    /**
     * 交换机
     */
    public final static String HOTEL_EXCHANGE = "hotel.topic";
    /**
     * 监听新增和修改的队列
     */
    public final static String HOTEL_INSERT_QUEUE = "hotel.insert.queue";
    /**
     * 监听删除的队列
     */
    public final static String HOTEL_DELETE_QUEUE = "hotel.delete.queue";
    /**
     * 新增或修改的RoutingKey
     */
    public final static String HOTEL_INSERT_KEY = "hotel.insert";
    /**
     * 删除的RoutingKey
     */
    public final static String HOTEL_DELETE_KEY = "hotel.delete";
}

```

2. 声明队列交换机

在hotel-demo和hotel-admin中分别定义配置类，声明队列、交换机：

```java
package cn.itcast.hotel.config;

import cn.itcast.hotel.constant.MqConstants;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MqConfig {
    @Bean
    public TopicExchange topicExchange() {
        return new TopicExchange(MqConstants.HOTEL_EXCHANGE, true, false);
    }

    @Bean
    public Queue insertQueue() {
        return new Queue(MqConstants.HOTEL_INSERT_QUEUE, true);
    }

    @Bean
    public Queue deleteQueue() {
        return new Queue(MqConstants.HOTEL_DELETE_QUEUE, true);
    }

    @Bean
    public Binding insertQueueBinding() {
        return BindingBuilder.bind(insertQueue()).to(topicExchange()).with(MqConstants.HOTEL_INSERT_KEY);
    }

    @Bean
    public Binding deleteQueueBinding() {
        return BindingBuilder.bind(deleteQueue()).to(topicExchange()).with(MqConstants.HOTEL_DELETE_KEY);
    }

}

```

3. ##### 发送MQ消息

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-19-image-20260619141258477.webp" alt="image" width="100%"> </div>

4. ##### 接收MQ消息

hotel-demo接收到MQ消息要做的事情包括：

- 新增消息：根据传递的hotel的id查询hotel信息，然后新增一条数据到索引库
- 删除消息：根据传递的hotel的id删除索引库中的一条数据

```java
package cn.itcast.hotel.mq;

import cn.itcast.hotel.constant.MqConstants;
import cn.itcast.hotel.service.IHotelService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class HotelListener {

    @Autowired
    private IHotelService hotelService;

    /**
     * 监听酒店新增或修改的业务
     *
     * @param id 酒店id
     */
    @RabbitListener(queues = MqConstants.HOTEL_INSERT_QUEUE)
    public void listenHotelInsertOrUpdate(Long id) {
        hotelService.insertById(id);
    }

    /**
     * 监听酒店删除的业务
     *
     * @param id 酒店id
     */
    @RabbitListener(queues = MqConstants.HOTEL_DELETE_QUEUE)
    public void listenHotelDelete(Long id) {
        hotelService.deleteById(id);
    }
}
```

# 集群

单机的elasticsearch做数据存储，必然面临两个问题：海量数据存储问题、单点故障问题。

- **海量数据存储问题：将索引库从逻辑上拆分为N个分片（shard），存储到多个节点**
- **单点故障问题：将分片数据在不同节点备份（replica ）**

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618225736338.webp" alt="image" width="100%"> </div>

## 集群部署

首先编写一个docker-compose文件，内容如下：

```yaml
version: '2.2'
services:
  es01:
    image: elasticsearch:7.12.1
    container_name: es01
    environment:
      - node.name=es01
      - cluster.name=es-docker-cluster
      - discovery.seed_hosts=es02,es03
      - cluster.initial_master_nodes=es01,es02,es03
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - data01:/usr/share/elasticsearch/data
    ports:
      - 9200:9200
    networks:
      - elastic
  es02:
    image: elasticsearch:7.12.1
    container_name: es02
    environment:
      - node.name=es02
      - cluster.name=es-docker-cluster
      - discovery.seed_hosts=es01,es03
      - cluster.initial_master_nodes=es01,es02,es03
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - data02:/usr/share/elasticsearch/data
    ports:
      - 9201:9200
    networks:
      - elastic
  es03:
    image: elasticsearch:7.12.1
    container_name: es03
    environment:
      - node.name=es03
      - cluster.name=es-docker-cluster
      - discovery.seed_hosts=es01,es02
      - cluster.initial_master_nodes=es01,es02,es03
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    volumes:
      - data03:/usr/share/elasticsearch/data
    networks:
      - elastic
    ports:
      - 9202:9200
volumes:
  data01:
    driver: local
  data02:
    driver: local
  data03:
    driver: local

networks:
  elastic:
    driver: bridge
```

es运行需要修改一些linux系统权限，修改`/etc/sysctl.conf`文件

```sh
vi /etc/sysctl.conf
```

添加下面的内容：**提高单个进程（Elasticsearch）允许创建的虚拟内存映射区域（Memory Map Areas）的数量上限**。

```sh
vm.max_map_count=262144
```

然后执行命令，让配置生效：

```sh
sysctl -p
```

通过docker-compose启动集群：

```sh
docker-compose up -d
```

## 集群状态监控

kibana可以监控es集群，不过新版本需要依赖es的x-pack 功能，配置比较复杂。

这里推荐使用cerebro来监控es集群状态，官方网址：https://github.com/lmenezes/cerebro

**启动**：直接进入解压后的目录，运行启动脚本即可

> 默认情况下，Cerebro 会监听 `0.0.0.0:9000`。服务启动后，通过 `http://你的服务器IP:9000` 即可访问。

1. **访问 Cerebro 界面**：在浏览器中打开 Cerebro 的 Web 页面。
2. **输入 ES 节点地址**：在页面提示框中，输入你的 Elasticsearch 集群中**任意一个节点的访问地址和端口**（默认为 `9200`）。
   - 对于**非安全集群**，输入 `http://你的ES节点IP:9200`。
   - 对于**开启了安全认证的集群**，输入 `https://你的ES节点IP:9200`，并填写用户名和密码。
3. **连接**：点击连接按钮，即可进入集群管理界面。

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618231906816.webp" alt="image" width="100%"> </div>

## 集群职责

elasticsearch中集群节点有不同的职责划分：

| **节点类型**    | **配置参数**                             | **默认值** | **节点职责**                                                 |
| :-------------- | :--------------------------------------- | :--------- | :----------------------------------------------------------- |
| master eligible | node.master                              | true       | 备选主节点：主节点可以管理和记录集群状态、决定分片在哪个节点、处理创建和删除索引库的请求 |
| data            | node.data                                | true       | 数据节点：存储数据、搜索、聚合、CRUD                         |
| ingest          | node.ingest                              | true       | 数据存储之前的预处理                                         |
| coordinating    | 上面3个参数都为false则为coordinating节点 | 无         | 路由请求到其它节点合并其它节点处理的结果，返回给用户         |

默认情况下，集群中的任何一个节点都同时具备上述四种角色。
但是真实的集群一定要将集群职责分离：

- master节点：对CPU要求高，但是内存要求第
- data节点：对CPU和内存要求都高
- coordinating节点：对网络带宽、CPU要求高
- 职责分离可以让我们根据不同节点的需求分配不同的硬件去部署。而且避免业务之间的互相干扰。

一个典型的es集群职责划分如图：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618232250708.webp" alt="image" width="100%"> </div>

## 脑裂问题

默认情况下，每个节点都是master eligible节点，因此一旦master节点宕机，其它候选节点会选举一个成为主节点。当主节点与其他节点网络故障时，可能发生脑裂问题。

例如一个集群中，主节点与其它节点失联：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618232540658.webp" alt="image" width="100%"> </div>

此时，node2和node3认为node1宕机，就会重新选主：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618232701357.webp" alt="image" width="100%"> </div>

当node3当选后，集群继续对外提供服务，node2和node3自成集群，node1自成集群，两个集群数据不同步，出现数据差异。

当网络恢复后，因为集群中有两个master节点，集群状态的不一致，出现脑裂的情况：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618232727658.webp" alt="image" width="100%"> </div>

解决脑裂的方案是，要求选票超过 ( eligible节点数量 + 1 ）/ 2 才能当选为主，因此eligible节点数量最好是奇数。对应配置项是discovery.zen.minimum_master_nodes，在es7.0以后，已经成为默认配置，因此一般不会发生脑裂问题

例如：3个节点形成的集群，选票必须超过 （3 + 1） / 2 ，也就是2票。node3得到node2和node3的选票，当选为主。node1只有自己1票，没有当选。集群中依然只有1个主节点，没有出现脑裂。

## 集群分布式存储

Elasticsearch会通过hash算法来计算文档应该存储到哪个分片：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618233646432.webp" alt="image" width="100%"> </div>

说明：

- _routing默认是文档的id
- 算法与分片数量有关，因此索引库一旦创建，分片数量不能修改！

新增文档的流程如下：

1）新增一个id=1的文档
2）对id做hash运算，假如得到的是2，则应该存储到shard-2
3）shard-2的主分片在node3节点，将数据路由到node3
4）保存文档
5）同步给shard-2的副本replica-2，在node2节点
6）返回结果给coordinating-node节点

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618233758771.webp" alt="image" width="100%"> </div>

Elasticsearch的查询分成两个阶段：

1. scatter phase：分散阶段，coordinating node会把请求分发到每一个分片

2. gather phase：聚集阶段，coordinating node汇总data node的搜索结果，并处理为最终结果集返回给用户

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618233718091.webp" alt="image" width="100%"> </div>

## 集群故障转移

集群的master节点会监控集群中的节点状态，如果发现有节点宕机，会立即将宕机节点的分片数据迁移到其它节点，确保数据安全，这个叫做故障转移。

1. 例如一个集群结构如图：现在，node1是主节点，其它两个节点是从节点。

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618234010788.webp" alt="image" width="100%"> </div>

2）突然，node1发生了故障：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618234249595.webp" alt="image" width="100%"> </div>

宕机后的第一件事，需要重新选主，例如选中了node2：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618234311416.webp" alt="image" width="100%"> </div>

node2成为主节点后，会检测集群监控状态，发现：shard-1、shard-0没有副本节点。因此需要将node1上的数据迁移到node2、node3：

<div align="center">   <img src="https://blog-image-hosting-1444146195.cos.ap-guangzhou.myqcloud.com/images/2026-06-18-image-20260618234330426.webp" alt="image" width="100%"> </div>
