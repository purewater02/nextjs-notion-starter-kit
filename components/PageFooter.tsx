import * as React from 'react'

import Giscus from '@giscus/react'

import * as config from '@/lib/config'

import styles from './styles.module.css'

export const PageFooter: React.FC<{
  isBlogPost: boolean
}> = ({ isBlogPost }) => {
  // only display comments and page actions on blog post pages
  if (isBlogPost) {
    return (
      <div className={styles.comments}>
        <Giscus
          id='comments'
          repo={config.giscusRepo}
          repoId={config.giscusRepoId}
          category={config.giscusCategory}
          categoryId={config.giscusCategoryId}
          mapping='pathname'
          reactionsEnabled='1'
          emitMetadata='0'
          inputPosition='bottom'
          theme='dark_tritanopia'
          lang='ko'
          loading='lazy'
        />
      </div>
    )
  }

  return null
}
