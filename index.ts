#!/usr/bin/env node
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Key } from 'readline'
import { execSync } from 'child_process'
import { prompt, registerPrompt, Separator } from 'inquirer'
import * as chalk from 'chalk'

registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'))

type PackageManifest = {
  name: string,
  version: string
  scripts?: { [name: string]: string }
}

export function exec(cmd: string) {
  const stdio = [0, 1, 2]
  const execOptions = {
    stdio: stdio
  }
  execSync(cmd, execOptions)
}

export function fuzzyMatch(str: string, pattern: string) {
  pattern = pattern.split('').reduce((a, b) => {
    return a + '.*' + b
  })
  return (new RegExp(pattern, 'i')).test(str);
}

export const promptAutocomplete =
  (message: string, items: string[] | { value: string, name: string }[]): Promise<string> => {
    return prompt(<any>{
      type: 'autocomplete',
      message,
      name: 'result',
      source: (answers: any, input: string) => {
        return Promise.resolve(
          (items as any[]).filter((item) => {
            return input
              ? fuzzyMatch(item.value || item, input)
              : true
          })
        )
      },
    }).then(({ result }) => {
      return result
    }).catch((e) => {
      console.log('autocompletePrompt:', e)
    })
  }

export const promptInput =
  (message: string): Promise<string[]> => {
    return prompt(<any>{
      type: 'input',
      message,
      name: 'result',
    }).then(({ result }) => {
      return result
    }).catch((e) => {
      console.log('promptCheckbox:', e)
    })
  }

const packageFile = 'package.json'

const argsHas = (value: string) =>
  process.argv.reduce((has, arg) => has || arg === value, false)

const binScripts: { [name: string]: string } = {}

if (argsHas('--bin')) {
  const binFolder = path.join(process.cwd(), 'node_modules', '.bin');

  if (fs.existsSync(binFolder)) {
    fs.readdirSync(binFolder).filter(name => !/.cmd$/.test(name))
      .forEach((name) => {
        binScripts[name] = `${path.join('.bin', name)}`;
      })
  }
}

const execute = async () => {
  if (fs.existsSync(packageFile)) {
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf-8'))
    const scripts = Object.assign({}, pkg.scripts, Object.assign(binScripts, pkg.script))
    const scriptNames = Object.keys(scripts || {})

    if (scriptNames.length) {
      let askForParams = false
      const keyListener = (ch: string, key: Key) => {
        if (key.name === 'space') {
          process.stdin.emit('keypress', '', { name: 'enter' })
          askForParams = true
        }
      }
      process.stdin.addListener('keypress', keyListener)

      const longestTaskName = scriptNames
        .map(scriptsName => scriptsName.length).sort((a, b) => a - b).reverse()[0]
      const padName = (name: string) => name + (new Array(longestTaskName - name.length + 3)).join(' ')

      const scriptName = await promptAutocomplete('Choose task to run, use `space` to add params to script:\n',
        scriptNames.map(value => ({
          value, name: padName(value) + chalk.gray(` (${scripts[value]})`)
        }))
      )
      process.stdin.removeListener('keypress', keyListener)
      const cmd = 'yarn run ' + scriptName
      if (askForParams) {
        const params = await promptInput('Add params to script:')
        exec(cmd + ' -- ' + params)
      } else {
        exec(cmd)
      }
    } else {
      console.log(`yrun: no scripts to execute in ${packageFile}.`)
    }
  } else {
    console.log(`yrun: can not find ${packageFile} in current directory.`)
  }
}

execute()
