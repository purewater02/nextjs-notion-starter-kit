import * as React from 'react'
import Giscus from '@giscus/react';

import styles from './styles.module.css'

export const PageFooter: React.FC<{
  isBlogPost: boolean
}> = ({ isBlogPost }) => {
  // only display comments and page actions on blog post pages
  if (isBlogPost) {
    return (
      <div className={styles.comments}>
        <Giscus
          id="comments"
          repo="purewater02/blog-comments"
          repoId="R_kgDOMyiR3w"
          category="Comments"
          categoryId="DIC_kwDOMyiR384CihZ_"
          mapping="pathname"
          reactionsEnabled="1"
          emitMetadata="0"
          inputPosition="bottom"
          theme="dark_tritanopia"
          lang="ko"
          loading="lazy"
        />
      </div>
    );
  }

  return null
}
