<?php
namespace AGR\Cards;
class D11w_LawnFertilzer extends Card
{
  public function __construct()
  {
    $this->name = clienttranslate('Lawn Fertilzer (legacy typo)');
    $this->deck = 'D';
    $this->number = 11;
    $this->banned = true;
  }
}
