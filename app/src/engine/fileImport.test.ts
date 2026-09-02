import { describe, expect, it } from 'vitest'
import { csvToBlockContent, fileToBlockContent, jsonToBlockContent, parseCsv } from './fileImport'

describe('parseCsv（RFC4180 子集）', () => {
  it('基础：逗号分列、换行分行、CRLF', () => {
    expect(parseCsv('a,b,c\r\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('引号：字段内逗号/换行/双引号转义/BOM', () => {
    expect(parseCsv('\uFEFFa,b\n"x,1","he said ""hi""\nsecond line"')).toEqual([
      ['a', 'b'],
      ['x,1', 'he said "hi"\nsecond line'],
    ])
  })
  it('空行跳过（单空字段行不算数据）', () => {
    expect(parseCsv('a,b\n\n1,2')).toHaveLength(2)
  })
})

describe('csvToBlockContent', () => {
  it('首行作表头，每行转 "表头: 值"，逗号连接', () => {
    const r = csvToBlockContent('日期,线索,金额\n9-01,23,86万\n9-08,31,102万')
    expect(r.content).toBe('日期: 9-01，线索: 23，金额: 86万\n日期: 9-08，线索: 31，金额: 102万')
    expect(r.totalRows).toBe(2)
    expect(r.truncated).toBe(false)
  })
  it('值内换行压成空格；超 120 行截断并注明', () => {
    const many = ['h1,h2', ...Array.from({ length: 150 }, (_, i) => `${i},v${i}`)].join('\n')
    const r = csvToBlockContent(many)
    expect(r.totalRows).toBe(150)
    expect(r.truncated).toBe(true)
    expect(r.content.split('\n')).toHaveLength(121)
    expect(r.content).toContain('已截断：共 150 行')
  })
})

describe('jsonToBlockContent', () => {
  it('对象数组：每对象一行 k: v', () => {
    const r = jsonToBlockContent('[{"周":"W36","线索":23},{"周":"W37","线索":31}]')
    expect(r.content.split('\n')).toEqual(['周: W36，线索: 23', '周: W37，线索: 31'])
  })
  it('单对象：kv 行；嵌套值 JSON 序列化', () => {
    const r = jsonToBlockContent('{"渠道":"官网","明细":{"a":1}}')
    expect(r.content.split('\n')).toEqual(['渠道: 官网', '明细: {"a":1}'])
  })
  it('字符串数组逐行；非法结构报错', () => {
    expect(jsonToBlockContent('["第一行","第二行"]').content).toBe('第一行\n第二行')
    expect(() => jsonToBlockContent('"just a string"')).toThrow()
  })
})

describe('fileToBlockContent 分派', () => {
  it('.json 走 JSON，.csv 走 CSV，其他按纯文本', () => {
    expect(fileToBlockContent('w.json', '{"a":1}').content).toContain('a: 1')
    expect(fileToBlockContent('w.csv', 'h\nv').content).toBe('h: v')
    expect(fileToBlockContent('notes.txt', '甲\n乙').content).toBe('甲\n乙')
  })
})
